// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// API Gateway-ийн тохиргоо/телеметр хүснэгтүүдийн Postgres gateway
// (gateway_services · gateway_request_logs).
//
// Эдгээр нь хэрэглэгч-тус-бүрийн БИШ лавлах/тохиргооны өгөгдөл тул RLS-д
// хамаарахгүй — rbac адаптертай ижил, шууд pool query.

import { badRequest, conflict, internalCause, notFound } from '../../../../apperror/index.js';
import type {
  GatewayOverview,
  GatewayPathStat,
  GatewayRequestLog,
  GatewayService,
  GatewayStatusBucket,
} from '../../../../domain/gateway.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import { isUniqueViolation, pgErrorCode, type Db } from '../../../drivers/pg.js';
import type { GatewayRepository, NewGatewayService } from '../../interface/gateway.js';

const serviceColumns =
  'id, name, protocol, host, port, path, retries, connect_timeout_ms, tags, enabled, created_at, updated_at';

interface ServiceRow {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  path: string;
  retries: number;
  connect_timeout_ms: number;
  tags: string[] | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date | null;
}

const toService = (r: ServiceRow): GatewayService => ({
  id: r.id,
  name: r.name,
  protocol: r.protocol,
  host: r.host,
  port: r.port,
  path: r.path,
  retries: r.retries,
  connectTimeout: r.connect_timeout_ms,
  tags: r.tags ?? [],
  enabled: r.enabled,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

interface LogRow {
  id: string;
  method: string;
  path: string;
  status: number;
  latency_ms: number;
  client_ip: string | null;
  created_at: Date;
}

const toLog = (r: LogRow): GatewayRequestLog => ({
  id: r.id,
  method: r.method,
  path: r.path,
  status: r.status,
  latencyMs: r.latency_ms,
  clientIp: r.client_ip ?? '',
  createdAt: r.created_at,
});

/** mapWrite нь бичих үйлдлийн pg алдааг домэйн алдаа руу буулгана. */
function mapWrite(err: unknown, conflictMsg: string): Error {
  if (isUniqueViolation(err)) return conflict(conflictMsg);
  if (pgErrorCode(err) === '23503') return badRequest('referenced record does not exist');
  return internalCause(err);
}

/** isInvalidUuid нь uuid биш текстийг (22P02) таана — 500 биш, "олдсонгүй". */
const isInvalidUuid = (err: unknown): boolean => pgErrorCode(err) === '22P02';

class GatewayPostgres implements GatewayRepository {
  constructor(private readonly db: Db) {}

  async listServices(ctx: Ctx): Promise<GatewayService[]> {
    try {
      const res = await this.db.query<ServiceRow>(
        ctx,
        `SELECT ${serviceColumns} FROM gateway_services ORDER BY name`,
      );
      return res.rows.map(toService);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getService(ctx: Ctx, id: string): Promise<GatewayService> {
    let res;
    try {
      res = await this.db.query<ServiceRow>(
        ctx,
        `SELECT ${serviceColumns} FROM gateway_services WHERE id = $1`,
        [id],
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('service not found');
    return toService(row);
  }

  async createService(ctx: Ctx, input: NewGatewayService): Promise<GatewayService> {
    try {
      // scope-ыг НЭРЭЭС автоматаар гаргана ('svc:'||name) — ингэснээр UI-аар
      // үүсгэсэн service-ийг ч application-д оноож (OAuth scope болгож) болно.
      const res = await this.db.query<ServiceRow>(
        ctx,
        `INSERT INTO gateway_services
             (name, protocol, host, port, path, retries, connect_timeout_ms, tags, enabled, scope)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'svc:'||$1)
         RETURNING ${serviceColumns}`,
        [
          input.name,
          input.protocol,
          input.host,
          input.port,
          input.path,
          input.retries,
          input.connectTimeout,
          input.tags,
          input.enabled,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error('create service: no row returned');
      return toService(row);
    } catch (err) {
      throw mapWrite(err, 'service name already exists');
    }
  }

  async updateService(ctx: Ctx, id: string, input: NewGatewayService): Promise<GatewayService> {
    let res;
    try {
      res = await this.db.query<ServiceRow>(
        ctx,
        `UPDATE gateway_services
            SET name=$2, protocol=$3, host=$4, port=$5, path=$6, retries=$7,
                connect_timeout_ms=$8, tags=$9, enabled=$10, updated_at=now()
          WHERE id=$1
          RETURNING ${serviceColumns}`,
        [
          id,
          input.name,
          input.protocol,
          input.host,
          input.port,
          input.path,
          input.retries,
          input.connectTimeout,
          input.tags,
          input.enabled,
        ],
      );
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw mapWrite(err, 'service name already exists');
    }
    const row = res.rows[0];
    if (!row) throw notFound('service not found');
    return toService(row);
  }

  async deleteService(ctx: Ctx, id: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, `DELETE FROM gateway_services WHERE id = $1`, [id]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      if (isInvalidUuid(err)) throw notFound('service not found');
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('service not found');
  }

  async listRequestLogs(ctx: Ctx, limit: number): Promise<GatewayRequestLog[]> {
    try {
      const res = await this.db.query<LogRow>(
        ctx,
        `SELECT id, method, path, status, latency_ms, client_ip, created_at
           FROM gateway_request_logs ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return res.rows.map(toLog);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async createRequestLog(
    ctx: Ctx,
    log: Omit<GatewayRequestLog, 'id' | 'createdAt'>,
  ): Promise<void> {
    await this.db.query(
      ctx,
      `INSERT INTO gateway_request_logs (method, path, status, latency_ms, client_ip)
       VALUES ($1,$2,$3,$4,$5)`,
      [log.method, log.path, log.status, log.latencyMs, log.clientIp],
    );
  }

  /**
   * overview нь dashboard-ийн нэгтгэлийг тооцоолно. Тоологдох утгууд (services/
   * applications/эрх) нь БҮХ хугацааных; харин хүсэлтийн телеметр нь сүүлийн 24
   * цагийнх. Хувь/p95-ийг нэг query-д `percentile_cont`-оор гаргана.
   */
  async overview(ctx: Ctx): Promise<GatewayOverview> {
    try {
      const res = await this.db.query<{
        services: string;
        consumers: string;
        active_keys: string;
        requests: string;
        errors: string;
        rate_limited: string;
        avg_latency: number;
        p95_latency: number;
      }>(
        ctx,
        `SELECT
             (SELECT count(*) FROM gateway_services)        AS services,
             (SELECT count(*) FROM applications)            AS consumers,
             (SELECT count(*) FROM application_services)    AS active_keys,
             COALESCE(count(*),0)                           AS requests,
             COALESCE(count(*) FILTER (WHERE status >= 500),0) AS errors,
             COALESCE(count(*) FILTER (WHERE status = 429),0)  AS rate_limited,
             COALESCE(avg(latency_ms),0)::int               AS avg_latency,
             COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::int AS p95_latency
           FROM gateway_request_logs
          WHERE created_at >= now() - interval '24 hours'`,
      );
      const r = res.rows[0];
      if (!r) throw new Error('overview: no row returned');

      // count(*) нь bigint тул драйвер МӨРӨӨР буцаана.
      const num = (v: string): number => Number.parseInt(v, 10);
      const requests24h = num(r.requests);
      const errors24h = num(r.errors);

      return {
        services: num(r.services),
        consumers: num(r.consumers),
        activeKeys: num(r.active_keys),
        requests24h,
        errors24h,
        rateLimited24h: num(r.rate_limited),
        errorRate: requests24h > 0 ? errors24h / requests24h : 0,
        avgLatencyMs: r.avg_latency,
        p95LatencyMs: r.p95_latency,
        statusBuckets: await this.statusBuckets(ctx),
        topPaths: await this.topPaths(ctx),
      };
    } catch (err) {
      throw internalCause(err);
    }
  }

  private async statusBuckets(ctx: Ctx): Promise<GatewayStatusBucket[]> {
    const res = await this.db.query<{ class: string; count: string }>(
      ctx,
      `SELECT (status/100)::text || 'xx' AS class, count(*) AS count
         FROM gateway_request_logs
        WHERE created_at >= now() - interval '24 hours'
        GROUP BY 1 ORDER BY 1`,
    );
    return res.rows.map((r) => ({ class: r.class, count: Number.parseInt(r.count, 10) }));
  }

  private async topPaths(ctx: Ctx): Promise<GatewayPathStat[]> {
    const res = await this.db.query<{ path: string; n: string }>(
      ctx,
      `SELECT path, count(*) AS n
         FROM gateway_request_logs
        WHERE created_at >= now() - interval '24 hours'
        GROUP BY path ORDER BY n DESC LIMIT 5`,
    );
    return res.rows.map((r) => ({ path: r.path, count: Number.parseInt(r.n, 10) }));
  }
}

export const newGatewayRepository = (db: Db): GatewayRepository => new GatewayPostgres(db);
