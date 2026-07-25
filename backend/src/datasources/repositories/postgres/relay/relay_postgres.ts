// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Platform-хоорондын хүсэлт дамжуулах + SLA хяналтын Postgres gateway.
// gateway_postgres-ийн адил platform-хоорондын тохиргоо/telemetry тул RLS-гүй
// (жирийн pool query).

import {
  badRequest,
  conflict,
  DomainError,
  internalCause,
  notFound,
} from '../../../../apperror/index.js';
import {
  RelayAsgAcknowledged,
  RelayAsgOverdue,
  RelayAsgPending,
  RelayReqFulfilled,
  RelayReqInProgress,
  RelayReqOverdue,
} from '../../../../domain/relay.js';
import type {
  RelayAssignment,
  RelayEvent,
  RelayOverview,
  RelayPlatform,
  RelayPlatformStat,
  RelayRequest,
  RelayRequestDetail,
  RelayRoute,
  RelayStatusBucket,
} from '../../../../domain/relay.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db, Queryable } from '../../../drivers/pg.js';
import { pgErrorCode } from '../../../drivers/pg.js';
import type {
  NewRelayAssignment,
  NewRelayEvent,
  NewRelayPlatform,
  NewRelayRequest,
  NewRelayRoute,
  RelayRepository,
} from '../../interface/relay.js';

const pgUniqueViolation = '23505';
const pgForeignKeyViolation = '23503';

/**
 * mapWrite нь бичилтийн DB алдааг домэйн алдаа болгоно — unique зөрчил нь
 * Conflict, foreign key зөрчил нь BadRequest (клиентийн өгсөн id буруу).
 */
function mapWrite(err: unknown, conflictMsg: string): Error {
  const code = pgErrorCode(err);
  if (code === pgUniqueViolation) return conflict(conflictMsg);
  if (code === pgForeignKeyViolation) return badRequest('referenced record does not exist');
  return internalCause(err);
}

// ── Мөрийн хэлбэрүүд (snake_case = баганы нэр) ───────────────────────────

interface PlatformRow {
  id: string;
  code: string;
  name: string;
  direction: string;
  endpoint_url: string;
  supervisor_contact: string;
  webhook_secret: string;
  enabled: boolean;
  created_at: Date;
}

const platformColumns =
  'id, code, name, direction, endpoint_url, supervisor_contact, webhook_secret, enabled, created_at';

const toPlatform = (r: PlatformRow): RelayPlatform => ({
  id: r.id,
  code: r.code,
  name: r.name,
  direction: r.direction,
  endpointUrl: r.endpoint_url,
  supervisorContact: r.supervisor_contact,
  webhookSecret: r.webhook_secret,
  enabled: r.enabled,
  createdAt: r.created_at,
});

interface RouteRow {
  id: string;
  service_code: string;
  platform_id: string;
  platform_name: string;
  sla_minutes: number;
  created_at: Date;
}

const routeSelect = `SELECT rr.id, rr.service_code, rr.platform_id, p.name AS platform_name, rr.sla_minutes, rr.created_at
    FROM relay_routes rr JOIN relay_platforms p ON p.id = rr.platform_id`;

const toRoute = (r: RouteRow): RelayRoute => ({
  id: r.id,
  serviceCode: r.service_code,
  platformId: r.platform_id,
  platformName: r.platform_name,
  slaMinutes: r.sla_minutes,
  createdAt: r.created_at,
});

interface RequestRow {
  id: string;
  source_platform: string;
  external_ref: string;
  service_code: string;
  title: string;
  payload: unknown;
  priority: string;
  received_at: Date;
  due_at: Date;
  status: string;
  result: unknown;
  fulfilled_at: Date | null;
  breach_notified: boolean;
  updated_at: Date | null;
}

const requestColumns = `id, source_platform, external_ref, service_code, title, payload, priority,
    received_at, due_at, status, result, fulfilled_at, breach_notified, updated_at`;

const toRequest = (r: RequestRow): RelayRequest => ({
  id: r.id,
  sourcePlatform: r.source_platform,
  externalRef: r.external_ref,
  serviceCode: r.service_code,
  title: r.title,
  payload: r.payload,
  priority: r.priority,
  receivedAt: r.received_at,
  dueAt: r.due_at,
  status: r.status,
  result: r.result,
  fulfilledAt: r.fulfilled_at,
  breachNotified: r.breach_notified,
  updatedAt: r.updated_at,
});

interface AssignmentRow {
  id: string;
  request_id: string;
  platform_id: string;
  platform_name: string;
  status: string;
  due_at: Date;
  dispatched_at: Date | null;
  responded_at: Date | null;
  result: unknown;
  reminders_sent: number;
  escalated: boolean;
}

const assignmentColumns = `a.id, a.request_id, a.platform_id, p.name AS platform_name, a.status, a.due_at,
    a.dispatched_at, a.responded_at, a.result, a.reminders_sent, a.escalated`;

const assignmentFrom = 'relay_assignments a JOIN relay_platforms p ON p.id = a.platform_id';

const toAssignment = (r: AssignmentRow): RelayAssignment => ({
  id: r.id,
  requestId: r.request_id,
  platformId: r.platform_id,
  platformName: r.platform_name,
  status: r.status,
  dueAt: r.due_at,
  dispatchedAt: r.dispatched_at,
  respondedAt: r.responded_at,
  result: r.result,
  remindersSent: r.reminders_sent,
  escalated: r.escalated,
});

interface EventRow {
  id: string;
  request_id: string;
  assignment_id: string | null;
  type: string;
  detail: string;
  created_at: Date;
}

const eventColumns = 'id, request_id, assignment_id, type, detail, created_at';

const toEvent = (r: EventRow): RelayEvent => ({
  id: r.id,
  requestId: r.request_id,
  assignmentId: r.assignment_id,
  type: r.type,
  detail: r.detail,
  createdAt: r.created_at,
});

/** jsonParam нь jsonb багана руу өгөх утгыг бэлтгэнэ (undefined → null). */
const jsonParam = (v: unknown): string | null =>
  v === undefined || v === null ? null : JSON.stringify(v);

class PostgresRelayRepository implements RelayRepository {
  constructor(private readonly db: Db) {}

  // ── Platforms ───────────────────────────────────────────────────────

  async listPlatforms(ctx: Ctx): Promise<RelayPlatform[]> {
    try {
      const res = await this.db.query<PlatformRow>(
        ctx,
        `SELECT ${platformColumns} FROM relay_platforms ORDER BY name`,
      );
      return res.rows.map(toPlatform);
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * getPlatformByCode нь code-оор нэг platform-ыг олно (webhook баталгаажуулах,
   * дээшээ дамжуулах эх/хүрэх platform-ыг тодорхойлоход).
   */
  async getPlatformByCode(ctx: Ctx, code: string): Promise<RelayPlatform> {
    let row: PlatformRow | undefined;
    try {
      const res = await this.db.query<PlatformRow>(
        ctx,
        `SELECT ${platformColumns} FROM relay_platforms WHERE code = $1`,
        [code],
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('platform not found');
    return toPlatform(row);
  }

  async createPlatform(ctx: Ctx, input: NewRelayPlatform): Promise<RelayPlatform> {
    try {
      const res = await this.db.query<PlatformRow>(
        ctx,
        `INSERT INTO relay_platforms(code, name, direction, endpoint_url, supervisor_contact, webhook_secret, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${platformColumns}`,
        [
          input.code,
          input.name,
          input.direction,
          input.endpointUrl,
          input.supervisorContact,
          input.webhookSecret,
          input.enabled,
        ],
      );
      // RETURNING нь ҮРГЭЛЖ нэг мөр өгнө — байхгүй бол драйверын гэрээ эвдэрсэн.
      const row = res.rows[0];
      if (!row) throw new Error('relay platform insert returned no row');
      return toPlatform(row);
    } catch (err) {
      throw mapWrite(err, 'platform code already exists');
    }
  }

  async deletePlatform(ctx: Ctx, id: string): Promise<void> {
    await this.execDelete(
      ctx,
      'DELETE FROM relay_platforms WHERE id = $1',
      id,
      'platform not found',
    );
  }

  private async execDelete(ctx: Ctx, sql: string, id: string, notFoundMsg: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, sql, [id]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound(notFoundMsg);
  }

  // ── Routes ──────────────────────────────────────────────────────────

  async listRoutes(ctx: Ctx): Promise<RelayRoute[]> {
    try {
      const res = await this.db.query<RouteRow>(
        ctx,
        `${routeSelect} ORDER BY rr.service_code, p.name`,
      );
      return res.rows.map(toRoute);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async routesForService(ctx: Ctx, serviceCode: string): Promise<RelayRoute[]> {
    try {
      // Зөвхөн ИДЭВХТЭЙ platform руу чиглүүлнэ — унтраасан peer рүү даалгавар
      // үүсгэвэл SLA цаг эхэлж, хэн ч хариулахгүй.
      const res = await this.db.query<RouteRow>(
        ctx,
        `${routeSelect} WHERE rr.service_code = $1 AND p.enabled ORDER BY p.name`,
        [serviceCode],
      );
      return res.rows.map(toRoute);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async createRoute(ctx: Ctx, input: NewRelayRoute): Promise<RelayRoute> {
    let id: string;
    try {
      const res = await this.db.query<{ id: string }>(
        ctx,
        'INSERT INTO relay_routes(service_code, platform_id, sla_minutes) VALUES ($1,$2,$3) RETURNING id',
        [input.serviceCode, input.platformId, input.slaMinutes],
      );
      const row = res.rows[0];
      if (!row) throw new Error('relay route insert returned no row');
      id = row.id;
    } catch (err) {
      throw mapWrite(err, 'route already exists for this service+platform');
    }
    try {
      const res = await this.db.query<RouteRow>(ctx, `${routeSelect} WHERE rr.id = $1`, [id]);
      const row = res.rows[0];
      if (!row) throw notFound('route not found');
      return toRoute(row);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async deleteRoute(ctx: Ctx, id: string): Promise<void> {
    await this.execDelete(ctx, 'DELETE FROM relay_routes WHERE id = $1', id, 'route not found');
  }

  // ── Requests + assignments ──────────────────────────────────────────

  async createRequestWithAssignments(
    ctx: Ctx,
    request: NewRelayRequest,
    assignments: NewRelayAssignment[],
  ): Promise<{ request: RelayRequest; assignments: RelayAssignment[] }> {
    try {
      return await this.db.withTx(ctx, async (tx: Queryable) => {
        const reqRes = await tx.query<{ id: string }>(
          `INSERT INTO relay_requests(source_platform, external_ref, service_code, title, payload, priority, due_at, status)
           VALUES ($1,$2,$3,$4,COALESCE($5::jsonb,'{}'::jsonb),$6,$7,$8) RETURNING id`,
          [
            request.sourcePlatform,
            request.externalRef,
            request.serviceCode,
            request.title,
            jsonParam(request.payload),
            request.priority,
            request.dueAt,
            request.status,
          ],
        );
        const reqRow = reqRes.rows[0];
        if (!reqRow) throw new Error('relay request insert returned no row');
        const requestId = reqRow.id;

        const stored: RelayAssignment[] = [];
        for (const a of assignments) {
          const aRes = await tx.query<{ id: string }>(
            'INSERT INTO relay_assignments(request_id, platform_id, status, due_at) VALUES ($1,$2,$3,$4) RETURNING id',
            [requestId, a.platformId, RelayAsgPending, a.dueAt],
          );
          const aRow = aRes.rows[0];
          if (!aRow) throw new Error('relay assignment insert returned no row');
          stored.push({
            id: aRow.id,
            requestId,
            platformId: a.platformId,
            platformName: a.platformName,
            status: RelayAsgPending,
            dueAt: a.dueAt,
            dispatchedAt: null,
            respondedAt: null,
            result: null,
            remindersSent: 0,
            escalated: false,
          });
        }

        const outRes = await tx.query<RequestRow>(
          `SELECT ${requestColumns} FROM relay_requests WHERE id = $1`,
          [requestId],
        );
        const outRow = outRes.rows[0];
        if (!outRow) throw new Error('relay request not found after insert');
        return { request: toRequest(outRow), assignments: stored };
      });
    } catch (err) {
      // Транзакц доторх домэйн алдаа (жишээ нь Conflict) 500 болж хувирах ёсгүй.
      if (err instanceof DomainError) throw err;
      throw mapWrite(err, 'request already exists');
    }
  }

  async getAssignment(ctx: Ctx, id: string): Promise<RelayAssignment> {
    let row: AssignmentRow | undefined;
    try {
      const res = await this.db.query<AssignmentRow>(
        ctx,
        `SELECT ${assignmentColumns} FROM ${assignmentFrom} WHERE a.id = $1`,
        [id],
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('assignment not found');
    return toAssignment(row);
  }

  async markDispatched(ctx: Ctx, assignmentId: string): Promise<void> {
    try {
      // `dispatched_at IS NULL` guard — давхар dispatch нь SLA-ийн эхлэлийг
      // ухраахгүй (reminder босго dispatched_at-аас тооцогддог).
      await this.db.query(
        ctx,
        'UPDATE relay_assignments SET dispatched_at = now(), status = $2 WHERE id = $1 AND dispatched_at IS NULL',
        [assignmentId, RelayAsgAcknowledged],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * respondAssignment нь assignment-ыг терминал төлөвт оруулж, бүх assignment
   * терминал болсон бол хүсэлтийг fulfilled болгоно. `status NOT IN
   * ('done','rejected')` guard нь зэрэг ирсэн 2 дахь хариуг Conflict болгоно.
   */
  async respondAssignment(
    ctx: Ctx,
    assignmentId: string,
    status: string,
    result: unknown,
  ): Promise<{ request: RelayRequest; fulfilled: boolean }> {
    try {
      return await this.db.withTx(ctx, async (tx: Queryable) => {
        const upd = await tx.query<{ request_id: string }>(
          `UPDATE relay_assignments SET status = $2, result = $3::jsonb, responded_at = now()
            WHERE id = $1 AND status NOT IN ('done','rejected') RETURNING request_id`,
          [assignmentId, status, jsonParam(result)],
        );
        const updRow = upd.rows[0];
        if (!updRow) throw conflict('assignment already responded or not found');
        const requestId = updRow.request_id;

        const pendingRes = await tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM relay_assignments
            WHERE request_id = $1 AND status NOT IN ('done','rejected')`,
          [requestId],
        );
        const pending = Number.parseInt(pendingRes.rows[0]?.count ?? '0', 10);

        let fulfilled = false;
        if (pending === 0) {
          // Хүсэлтийн нэгтгэсэн хариу: assignment-уудын result-ыг цуглуулна.
          await tx.query(
            `UPDATE relay_requests SET status = $2, fulfilled_at = now(), updated_at = now(),
                result = COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('platform_id', a.platform_id, 'status', a.status, 'result', a.result))
                    FROM relay_assignments a WHERE a.request_id = $1
                ), '[]'::jsonb)
              WHERE id = $1`,
            [requestId, RelayReqFulfilled],
          );
          fulfilled = true;
        } else {
          await tx.query(
            `UPDATE relay_requests SET status = $2, updated_at = now()
              WHERE id = $1 AND status IN ('received','dispatched')`,
            [requestId, RelayReqInProgress],
          );
        }

        const outRes = await tx.query<RequestRow>(
          `SELECT ${requestColumns} FROM relay_requests WHERE id = $1`,
          [requestId],
        );
        const outRow = outRes.rows[0];
        if (!outRow) throw notFound('request not found');
        return { request: toRequest(outRow), fulfilled };
      });
    } catch (err) {
      // Давхар хариу (Conflict) нь 409 хэвээр үлдэнэ — 500 болгож нуухгүй.
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }

  // ── SLA sweep query-ууд ─────────────────────────────────────────────

  /**
   * dueSoonAssignments нь идэвхтэй (терминал биш, overdue биш) бөгөөд due_at
   * хараахан болоогүй assignment-уудыг буцаана (reminder босго шалгахад).
   */
  async dueSoonAssignments(ctx: Ctx): Promise<RelayAssignment[]> {
    try {
      const res = await this.db.query<AssignmentRow>(
        ctx,
        `SELECT ${assignmentColumns} FROM ${assignmentFrom}
          WHERE a.status IN ('pending','acknowledged','in_progress') AND a.due_at > now()`,
      );
      return res.rows.map(toAssignment);
    } catch (err) {
      throw internalCause(err);
    }
  }

  /** overdueAssignments нь due_at өнгөрсөн ч терминал болоогүй assignment-ууд. */
  async overdueAssignments(ctx: Ctx): Promise<RelayAssignment[]> {
    try {
      const res = await this.db.query<AssignmentRow>(
        ctx,
        `SELECT ${assignmentColumns} FROM ${assignmentFrom}
          WHERE a.status IN ('pending','acknowledged','in_progress','overdue') AND a.due_at <= now()`,
      );
      return res.rows.map(toAssignment);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async markAssignmentOverdue(ctx: Ctx, assignmentId: string): Promise<void> {
    try {
      await this.db.query(
        ctx,
        `UPDATE relay_assignments SET status = $2 WHERE id = $1 AND status <> 'overdue'`,
        [assignmentId, RelayAsgOverdue],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  async incReminders(ctx: Ctx, assignmentId: string): Promise<void> {
    try {
      await this.db.query(
        ctx,
        'UPDATE relay_assignments SET reminders_sent = reminders_sent + 1 WHERE id = $1',
        [assignmentId],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  async markEscalated(ctx: Ctx, assignmentId: string): Promise<void> {
    try {
      await this.db.query(ctx, 'UPDATE relay_assignments SET escalated = true WHERE id = $1', [
        assignmentId,
      ]);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async markRequestOverdue(ctx: Ctx, requestId: string): Promise<void> {
    try {
      await this.db.query(
        ctx,
        `UPDATE relay_requests SET status = $2, updated_at = now()
          WHERE id = $1 AND status NOT IN ('fulfilled','rejected','overdue')`,
        [requestId, RelayReqOverdue],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  async markBreachNotified(ctx: Ctx, requestId: string): Promise<boolean> {
    try {
      // `breach_notified = false` guard — латч: дээд platform-д зөвхөн НЭГ удаа
      // мэдэгдэнэ (олон sweep зэрэг ажилласан ч давхардахгүй).
      const res = await this.db.query(
        ctx,
        'UPDATE relay_requests SET breach_notified = true WHERE id = $1 AND breach_notified = false',
        [requestId],
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Events ──────────────────────────────────────────────────────────

  async appendEvent(ctx: Ctx, input: NewRelayEvent): Promise<void> {
    try {
      await this.db.query(
        ctx,
        'INSERT INTO relay_events(request_id, assignment_id, type, detail) VALUES ($1,$2,$3,$4)',
        [input.requestId, input.assignmentId, input.type, input.detail],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  private async recentEvents(ctx: Ctx, limit: number): Promise<RelayEvent[]> {
    const res = await this.db.query<EventRow>(
      ctx,
      `SELECT ${eventColumns} FROM relay_events ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map(toEvent);
  }

  // ── Dashboard + жагсаалт ────────────────────────────────────────────

  async overview(ctx: Ctx): Promise<RelayOverview> {
    try {
      const res = await this.db.query<{
        total: string;
        received_today: string;
        in_progress: string;
        overdue: string;
        fulfilled: string;
        on_time: string;
        avg_mins: string;
      }>(
        ctx,
        `SELECT
            COALESCE(count(*),0)::text AS total,
            COALESCE(count(*) FILTER (WHERE received_at >= date_trunc('day', now())),0)::text AS received_today,
            COALESCE(count(*) FILTER (WHERE status IN ('received','dispatched','in_progress')),0)::text AS in_progress,
            COALESCE(count(*) FILTER (WHERE status = 'overdue'),0)::text AS overdue,
            COALESCE(count(*) FILTER (WHERE status = 'fulfilled'),0)::text AS fulfilled,
            COALESCE(count(*) FILTER (WHERE status = 'fulfilled' AND fulfilled_at <= due_at),0)::text AS on_time,
            COALESCE(avg(EXTRACT(EPOCH FROM (fulfilled_at - received_at))/60) FILTER (WHERE status='fulfilled'),0)::int::text AS avg_mins
          FROM relay_requests`,
      );
      const r = res.rows[0];
      const num = (v: string | undefined): number => Number.parseInt(v ?? '0', 10);
      const fulfilled = num(r?.fulfilled);
      const onTime = num(r?.on_time);

      return {
        total: num(r?.total),
        receivedToday: num(r?.received_today),
        inProgress: num(r?.in_progress),
        overdue: num(r?.overdue),
        fulfilled,
        slaCompliancePct: fulfilled > 0 ? onTime / fulfilled : 0,
        avgFulfillMins: num(r?.avg_mins),
        statusBuckets: await this.statusBuckets(ctx),
        platforms: await this.platformStats(ctx),
        recentEvents: await this.recentEvents(ctx, 20),
      };
    } catch (err) {
      throw internalCause(err);
    }
  }

  private async statusBuckets(ctx: Ctx): Promise<RelayStatusBucket[]> {
    const res = await this.db.query<{ status: string; count: string }>(
      ctx,
      'SELECT status, count(*)::text AS count FROM relay_requests GROUP BY status ORDER BY status',
    );
    return res.rows.map((r) => ({ status: r.status, count: Number.parseInt(r.count, 10) }));
  }

  private async platformStats(ctx: Ctx): Promise<RelayPlatformStat[]> {
    const res = await this.db.query<{
      id: string;
      name: string;
      total: string;
      done: string;
      overdue: string;
      pending: string;
      on_time: string;
    }>(
      ctx,
      `SELECT p.id, p.name,
          COALESCE(count(a.id),0)::text AS total,
          COALESCE(count(a.id) FILTER (WHERE a.status = 'done'),0)::text AS done,
          COALESCE(count(a.id) FILTER (WHERE a.status = 'overdue'),0)::text AS overdue,
          COALESCE(count(a.id) FILTER (WHERE a.status IN ('pending','acknowledged','in_progress')),0)::text AS pending,
          COALESCE(count(a.id) FILTER (WHERE a.status = 'done' AND a.responded_at <= a.due_at),0)::text AS on_time
        FROM relay_platforms p LEFT JOIN relay_assignments a ON a.platform_id = p.id
        GROUP BY p.id, p.name ORDER BY p.name`,
    );
    return res.rows.map((r) => {
      const done = Number.parseInt(r.done, 10);
      const onTime = Number.parseInt(r.on_time, 10);
      return {
        platformId: r.id,
        platformName: r.name,
        total: Number.parseInt(r.total, 10),
        done,
        overdue: Number.parseInt(r.overdue, 10),
        pending: Number.parseInt(r.pending, 10),
        compliancePct: done > 0 ? onTime / done : 0,
      };
    });
  }

  async listRequests(ctx: Ctx, limit: number): Promise<RelayRequest[]> {
    try {
      const res = await this.db.query<RequestRow>(
        ctx,
        `SELECT ${requestColumns} FROM relay_requests ORDER BY received_at DESC LIMIT $1`,
        [limit],
      );
      return res.rows.map(toRequest);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getRequestDetail(ctx: Ctx, id: string): Promise<RelayRequestDetail> {
    let request: RelayRequest;
    try {
      const res = await this.db.query<RequestRow>(
        ctx,
        `SELECT ${requestColumns} FROM relay_requests WHERE id = $1`,
        [id],
      );
      const row = res.rows[0];
      if (!row) throw notFound('request not found');
      request = toRequest(row);
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }

    try {
      const asgRes = await this.db.query<AssignmentRow>(
        ctx,
        `SELECT ${assignmentColumns} FROM ${assignmentFrom} WHERE a.request_id = $1 ORDER BY p.name`,
        [id],
      );
      const evtRes = await this.db.query<EventRow>(
        ctx,
        `SELECT ${eventColumns} FROM relay_events WHERE request_id = $1 ORDER BY created_at`,
        [id],
      );
      return {
        request,
        assignments: asgRes.rows.map(toAssignment),
        events: evtRes.rows.map(toEvent),
      };
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newRelayRepository = (db: Db): RelayRepository => new PostgresRelayRepository(db);
