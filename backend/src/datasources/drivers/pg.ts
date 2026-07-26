// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// drivers нь config утгуудыг холбогдсон өгөгдлийн сангийн драйвер болгон
// хувиргадаг композицийн давхарга юм. Энэ template нь node-postgres (pg) ашигладаг
// — ORM-гүй, түүхий SQL-ийг repository давхаргад гараар бичдэг.

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { AppConfig } from '../../config/config.js';
import {
  EnvironmentDevelopment,
  EnvironmentProduction,
  LoggerCategory,
  LoggerCategoryDatabase,
} from '../../constants/index.js';
import { identityOf, type Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';

/** PgUniqueViolation нь Postgres-ийн unique_violation-ийн SQLSTATE код юм. */
export const PgUniqueViolation = '23505';

/** PgForeignKeyViolation нь foreign_key_violation-ийн SQLSTATE код юм. */
export const PgForeignKeyViolation = '23503';

/** isPgError нь Postgres-ийн драйверын алдаанаас SQLSTATE код гаргана. */
export function pgErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** isUniqueViolation нь unique индекс зөрчлийг тодорхойлно. */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === PgUniqueViolation;
}

/** Queryable нь pool болон транзакцийн клиент хоёуланд нийцэх нарийн гэрээ. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

/**
 * Db нь апп-ын өгөгдлийн сангийн гар — repository-ууд зөвхөн үүнийг хардаг.
 * withRLS нь RLS identity-г транзакц бүрд тавьдаг цорын ганц зам юм.
 */
export class Db {
  constructor(readonly pool: Pool) {}

  /** query нь RLS-гүй (identity шаардахгүй) уншилт/бичилтэд зориулсан шууд гарц. */
  async query<R extends QueryResultRow = QueryResultRow>(
    _ctx: Ctx,
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(sql, params as unknown[]);
  }

  /**
   * withRLS нь нэг ба түүнээс дээш query-г транзакцид боож, тухайн транзакцид
   * зориулж Postgres-ийн Row-Level Security session хувьсагчдыг (app.user_id,
   * app.user_role) тогтооно. Утгуудыг контекстээс уншиж авдаг.
   *
   * Яагаад транзакц шаардлагатай вэ: set_config-ийн гурав дахь аргумент
   * (is_local) нь `true` — энэ нь `SET LOCAL`-той дүйцэх бөгөөд утгыг зөвхөн
   * ИДЭВХТЭЙ транзакцийн туршид хадгална. pg нь холболтын pool ашигладаг тул
   * жирийн `SET` нь нэг хүсэлтийн identity-г pool дахь холболтод үлдээж,
   * дараагийн хамааралгүй хүсэлт рүү "алдагдуулах" эрсдэлтэй; SET LOCAL
   * транзакц commit/rollback хийгдмэгц автоматаар арилдаг тул энэ алдагдлаас
   * сэргийлнэ.
   *
   * Контекстэд Identity байхгүй бол userId/role нь хоосон болж, RLS бодлогууд
   * бүх мөрийг хаана — аюулгүй өгөгдмөл (fail-closed).
   */
  async withRLS<T>(ctx: Ctx, fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const id = identityOf(ctx);
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await client.query(
          `SELECT set_config('app.user_id',$1,true), set_config('app.user_role',$2,true)`,
          [id?.userId ?? '', id?.role ?? ''],
        );
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        // Rollback хийхэд гарсан алдааг дардаггүй — үндсэн алдаа нь чухал.
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    } finally {
      client.release();
    }
  }

  /** withTx нь RLS identity шаардахгүй, зөвхөн атомт байдал хэрэгтэй урсгалд. */
  async withTx<T>(_ctx: Ctx, fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      try {
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * guardRLSEnforceable нь api-ийн DB role нь Row-Level Security-г бодитоор
 * мөрддөг эсэхийг boot үед шалгана: superuser болон BYPASSRLS эрхтэй role RLS
 * бодлогуудыг ЧИМЭЭГҮЙ алгасдаг тул production-д ийм холболтыг зөвшөөрвөл users
 * хүснэгтийн тусгаарлалт огт ажиллахгүй. Production-д fail-closed (boot
 * унагана); development-д анхааруулга логдоод үргэлжилнэ (migrate/тест superuser
 * хэрэглэж болно).
 */
async function guardRLSEnforceable(pool: Pool): Promise<void> {
  let role = '';
  let isSuper = false;
  let bypass = false;
  try {
    const res = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    const row = res.rows[0];
    if (!row) return;
    role = row.rolname;
    isSuper = row.rolsuper;
    bypass = row.rolbypassrls;
  } catch (err) {
    // pg_roles унших эрхгүй гэх мэт ховор тохиолдолд шалгалтыг алгасна — энэ
    // guard нь нэмэлт хамгаалалт, холболтыг таслах шалтгаан биш.
    logger.warn(`RLS guard: could not inspect current role (skipping): ${logger.errText(err)}`, {
      [LoggerCategory]: LoggerCategoryDatabase,
    });
    return;
  }

  if (!isSuper && !bypass) return;

  const msg = `DB role "${role}" has superuser=${isSuper} bypassrls=${bypass} — Row-Level Security is NOT enforced for this connection; use a least-privilege app role (see deploy/initdb)`;
  if (AppConfig.ENVIRONMENT === EnvironmentProduction) {
    throw new Error(`rls guard: ${msg}`);
  }
  logger.warn(`RLS guard: ${msg}`, { [LoggerCategory]: LoggerCategoryDatabase });
}

/**
 * setupPostgres нь config-оос DB_POSTGRE_* түлхүүрүүдийг уншиж, Postgres руу
 * чиглэсэн pool-г бүтээж, ping хийж, RLS guard-ыг шалгана.
 */
export async function setupPostgres(): Promise<Db> {
  const dsn =
    AppConfig.ENVIRONMENT === EnvironmentDevelopment
      ? AppConfig.DB_POSTGRE_DSN
      : AppConfig.DB_POSTGRE_URL;

  const pool = new Pool({
    connectionString: dsn,
    max: AppConfig.DB_MAX_OPEN_CONNS,
    min: AppConfig.DB_MAX_IDLE_CONNS,
    // Go хувилбарын MaxConnLifetime / MaxConnIdleTime-тай дүйцүүлэв.
    maxLifetimeSeconds: AppConfig.DB_CONN_MAX_LIFE_MINS * 60,
    idleTimeoutMillis: 5 * 60 * 1000,
    // Хэрэглэгчийн хүсэлтийг хязгааргүй хугацаагаар тээглүүлэхгүй.
    connectionTimeoutMillis: 10_000,
  });

  // Pool-ийн idle клиент дээр гарсан алдаа нь process-ийг унагах ёсгүй.
  pool.on('error', (err) => {
    logger.error(`pg pool idle client error: ${logger.errText(err)}`, {
      [LoggerCategory]: LoggerCategoryDatabase,
    });
  });

  logger.info(
    `Setting pg pool max/min conns to ${AppConfig.DB_MAX_OPEN_CONNS}/${AppConfig.DB_MAX_IDLE_CONNS}`,
    { [LoggerCategory]: LoggerCategoryDatabase },
  );

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    await pool.end().catch(() => undefined);
    throw new Error(`error pinging database: ${logger.errText(err)}`);
  }

  try {
    await guardRLSEnforceable(pool);
  } catch (err) {
    await pool.end().catch(() => undefined);
    throw err;
  }

  return new Db(pool);
}
