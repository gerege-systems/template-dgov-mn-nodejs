// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// migration нь cmd/migration-ийн ард байрлах туршиж болох сан юм. CLI нь энэ
// модулийн нимгэн бүрхүүл (config ачаалах + аргумент задлах + pool холбох) тул
// idempotency / advisory-lock / нэг файлд нэг транзакцийн зан төлөвийг binary
// ажиллуулалгүйгээр integration тестэд шалгаж болно.

import fs from 'node:fs/promises';
import path from 'node:path';

import type { Pool, PoolClient } from 'pg';

import { LoggerCategory, LoggerCategoryMigration, LoggerFile } from '../../constants/index.js';
import * as logger from '../../pkg/logger/logger.js';

/**
 * AdvisoryLockID нь pg_advisory_lock-той хамт ашиглагддаг дурын 64-бит бүхэл тоо
 * бөгөөд хоёр migration runner нэг файлыг зэрэг хэрэгжүүлэхээс сэргийлдэг.
 */
export const AdvisoryLockID = 947328461230;

type LogSink = (msg: string, fields: logger.Fields) => void;

/**
 * Runner нь schema_migrations хүснэгтэд хэрэгжсэн төлөвийг хянахын зэрэгцээ
 * Postgres DB-д SQL migration файлуудыг хэрэгжүүлэх/буцаах үйлдлийг гүйцэтгэнэ.
 * Бүх ажил pool-аас авсан НЭГ dedicated холболт дээр ажилладаг тул
 * session-scoped advisory lock зөв ажиллана.
 */
export class Runner {
  /** log нь тестүүдэд no-op sink сольж тавих боломж олгоно. */
  private log: LogSink | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly dir: string,
  ) {}

  /** setLogger нь өгөгдмөл logger sink-г дарж бичнэ. */
  setLogger(fn: LogSink): void {
    this.log = fn;
  }

  private info(msg: string, fields: logger.Fields): void {
    if (this.log) {
      this.log(msg, fields);
      return;
    }
    logger.info(msg, fields);
  }

  /**
   * withConnLock нь pool-аас холболт авч, advisory lock-ийн дор fn-г ажиллуулна.
   * Lock болон migration-ууд НЭГ холболт дээр ажилладаг тул session-scoped lock
   * зөв effect-тэй. Зэрэгцээ runner-уудыг (CI + хөгжүүлэгчийн зөөврийн компьютер)
   * дараалалд оруулна.
   */
  private async withConnLock<T>(fn: (conn: PoolClient) => Promise<T>): Promise<T> {
    const conn = await this.pool.connect();
    try {
      await conn.query('SELECT pg_advisory_lock($1)', [AdvisoryLockID]);
      try {
        return await fn(conn);
      } finally {
        try {
          await conn.query('SELECT pg_advisory_unlock($1)', [AdvisoryLockID]);
        } catch (err) {
          logger.error('failed to release migration advisory lock', {
            [LoggerCategory]: LoggerCategoryMigration,
            error: logger.errText(err),
          });
        }
      }
    } finally {
      conn.release();
    }
  }

  /**
   * up нь бүх *.up.sql файлыг дугаарын дарааллаар хэрэгжүүлнэ.
   * schema_migrations-д аль хэдийн байгаа файлуудыг алгасдаг тул дахин
   * ажиллуулалт idempotent байна. Файл бүр өөрийн statement болон
   * schema_migrations мөрийг нэг транзакцид commit хийнэ.
   */
  async up(): Promise<void> {
    this.info('running migration [up]', { [LoggerCategory]: LoggerCategoryMigration });
    await this.withConnLock(async (conn) => {
      await ensureMigrationsTable(conn);
      const files = await this.listFiles('up');
      const applied = await loadApplied(conn);
      for (const file of files) {
        const name = path.basename(file);
        if (applied.has(name)) {
          this.info('skipping already-applied migration', {
            [LoggerCategory]: LoggerCategoryMigration,
            [LoggerFile]: name,
          });
          continue;
        }
        this.info('applying migration', {
          [LoggerCategory]: LoggerCategoryMigration,
          [LoggerFile]: name,
        });
        await applyFile(conn, file, name, true);
      }
      this.info('migration [up] success', { [LoggerCategory]: LoggerCategoryMigration });
    });
  }

  /**
   * down нь бүх *.down.sql файлыг ЭСРЭГ дарааллаар хэрэгжүүлнэ. Амжилттай down
   * бүр тохирох schema_migrations мөрийг устгана.
   */
  async down(): Promise<void> {
    this.info('running migration [down]', { [LoggerCategory]: LoggerCategoryMigration });
    await this.withConnLock(async (conn) => {
      await ensureMigrationsTable(conn);
      const files = (await this.listFiles('down')).reverse();
      for (const file of files) {
        const name = path.basename(file);
        this.info('reverting migration', {
          [LoggerCategory]: LoggerCategoryMigration,
          [LoggerFile]: name,
        });
        await applyFile(conn, file, deriveUpName(name), false);
      }
      this.info('migration [down] success', { [LoggerCategory]: LoggerCategoryMigration });
    });
  }

  private async listFiles(action: 'up' | 'down'): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch {
      throw new Error('glob migration files');
    }
    const suffix = `.${action}.sql`;
    const files = entries.filter((e) => e.endsWith(suffix)).map((e) => path.join(this.dir, e));
    // Лексикограф эрэмбэ ашиглаж БОЛОХГҮЙ: "10_" нь "1_"-ээс өмнө ордог
    // ('0' < '_') тул шинэ хоосон DB дээр 10-р migration 1-ээс түрүүлж ажиллана.
    // Файлын нэрний эхний дугаараар тоон эрэмбэлнэ.
    files.sort((a, b) => {
      const diff = migrationNumber(a) - migrationNumber(b);
      if (diff !== 0) return diff;
      return path.basename(a).localeCompare(path.basename(b));
    });
    return files;
  }
}

async function ensureMigrationsTable(conn: PoolClient): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * migrationNumber нь "N_name.up.sql" маягийн файлын нэрнээс эхний N дугаарыг
 * буцаана; дугааргүй файл хамгийн сүүлд эрэмбэлэгдэнэ.
 */
export function migrationNumber(p: string): number {
  const name = path.basename(p);
  const i = name.indexOf('_');
  if (i <= 0) return Number.MAX_SAFE_INTEGER;
  const n = Number.parseInt(name.slice(0, i), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

async function loadApplied(conn: PoolClient): Promise<Set<string>> {
  const res = await conn.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(res.rows.map((r) => r.name));
}

/**
 * applyFile нь migration SQL файлыг schema_migrations-ийн бүртгэлийн бичилттэй
 * хамт нэг транзакцид ажиллуулдаг — ингэснээр файлын дунд гацах нь хэсэгчилсэн
 * бичлэг үлдээдэггүй.
 */
async function applyFile(
  conn: PoolClient,
  file: string,
  upName: string,
  isUp: boolean,
): Promise<void> {
  // Файлын замууд нь хүсэлтийн оролтоос биш, хөгжүүлэгчийн хяналт дахь
  // migrations директороос ирдэг.
  const data = await fs.readFile(file, 'utf8');

  await conn.query('BEGIN');
  try {
    await conn.query(data);
    if (isUp) {
      await conn.query('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [
        upName,
      ]);
    } else {
      await conn.query('DELETE FROM schema_migrations WHERE name = $1', [upName]);
    }
    await conn.query('COMMIT');
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => undefined);
    throw new Error(`exec ${path.basename(file)}: ${logger.errText(err)}`);
  }
}

/**
 * deriveUpName нь "*.down.sql" файлын нэрийг түүний "*.up.sql" хослол болгон
 * хувиргадаг бөгөөд migration-ууд schema_migrations-д яг ийм байдлаар
 * түлхүүрлэгддэг.
 */
export function deriveUpName(downName: string): string {
  const suffix = '.down.sql';
  return downName.endsWith(suffix) ? `${downName.slice(0, -suffix.length)}.up.sql` : downName;
}

export function newRunner(pool: Pool, dir: string): Runner {
  return new Runner(pool, dir);
}
