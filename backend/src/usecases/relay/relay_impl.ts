// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { badRequest, forbidden, unauthorized } from '../../apperror/index.js';
import type { RelayRepository } from '../../datasources/repositories/interface/relay.js';
import type { NewRelayAssignment } from '../../datasources/repositories/interface/relay.js';
import {
  RelayAsgDone,
  RelayAsgOverdue,
  RelayAsgRejected,
  RelayDirUpstream,
  RelayEscalateGraceMs,
  RelayEvtBreachNotified,
  RelayEvtDispatched,
  RelayEvtEscalated,
  RelayEvtForwardedUp,
  RelayEvtFulfilled,
  RelayEvtOverdue,
  RelayEvtReceived,
  RelayEvtReminded,
  RelayEvtResponded,
  RelayReqDispatched,
  RelayReqFulfilled,
  relayRemindersDue,
  relayNewWebhookSecret,
  relayVerifyWebhook,
  RelayDirDownstream,
  RelayWebhookSourceHeader,
} from '../../domain/relay.js';
import type {
  RelayAssignment,
  RelayOverview,
  RelayPlatform,
  RelayRequest,
  RelayRequestDetail,
  RelayRoute,
  RelayWebhookEnvelope,
} from '../../domain/relay.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import { deliverWebhook } from './relay_webhook.js';
import type {
  IngestInput,
  PlatformInput,
  RelayUsecase,
  RespondInput,
  RouteInput,
} from './relay_usecase.js';

/**
 * simulateHoldMs нь demo simulator доод platform-ыг "ажиллаж байгаа мэт"
 * харагдуулахаар хариу үүсгэхээсээ өмнө хүлээх хугацаа.
 */
const simulateHoldMs = 20_000;

/**
 * simulateDemoWindowMs нь demo хүсэлтийн богино SLA цонх — dashboard дээр
 * reminder/overdue/escalate урсгалыг хэдэн минутын дотор амьд харуулна.
 */
const simulateDemoWindowMs = 90_000;

const defaultListLimit = 50;
const maxListLimit = 200;
const defaultSlaMinutes = 60;

class RelayUsecaseImpl implements RelayUsecase {
  constructor(private readonly repo: RelayRepository) {}

  /** event нь timeline/feed бичлэг нэмнэ (best-effort; хүсэлтийг блоклохгүй). */
  private async event(
    ctx: Ctx,
    requestId: string,
    assignmentId: string | null,
    type: string,
    detail: string,
  ): Promise<void> {
    try {
      await this.repo.appendEvent(ctx, { requestId, assignmentId, type, detail });
    } catch (err) {
      logger.errorWithContext(ctx, 'relay: append event failed (non-fatal)', {
        error: logger.errText(err),
      });
    }
  }

  // ── Ingest / dispatch / respond ─────────────────────────────────────

  async ingest(ctx: Ctx, input: IngestInput): Promise<RelayRequest> {
    const code = input.serviceCode.trim();
    if (code === '') throw badRequest('service_code шаардлагатай');

    const routes = await this.repo.routesForService(ctx, code);
    if (routes.length === 0) {
      throw badRequest('энэ service_code-д чиглүүлэлт (routing) тохируулаагүй байна');
    }

    const now = Date.now();
    const reqDueMs = input.dueAt ? input.dueAt.getTime() : 0;
    let latest = now;
    const assignments: NewRelayAssignment[] = routes.map((rt) => {
      let due = now + rt.slaMinutes * 60_000;
      // Assignment-ийн SLA нь хүсэлтийн эцсийн хугацаанаас ХЭТЭРЧ БОЛОХГҮЙ.
      if (reqDueMs !== 0 && due > reqDueMs) due = reqDueMs;
      if (due > latest) latest = due;
      return { platformId: rt.platformId, platformName: rt.platformName, dueAt: new Date(due) };
    });

    const priority = input.priority.trim() === '' ? 'normal' : input.priority.trim();
    const stored = await this.repo.createRequestWithAssignments(
      ctx,
      {
        sourcePlatform: input.sourcePlatform,
        externalRef: input.externalRef,
        serviceCode: code,
        title: input.title,
        payload: input.payload,
        priority,
        dueAt: new Date(reqDueMs === 0 ? latest : reqDueMs),
        // Ingest дараа шууд дамжуулна.
        status: RelayReqDispatched,
      },
      assignments,
    );

    await this.event(
      ctx,
      stored.request.id,
      null,
      RelayEvtReceived,
      `Хүсэлт хүлээн авлаа: ${code} — ${String(stored.assignments.length)} байгууллагад дамжуулна`,
    );
    await this.dispatch(ctx, stored.request, stored.assignments);
    return stored.request;
  }

  /**
   * dispatch нь assignment бүрийг доод platform руу дамжуулна. Бодит
   * endpoint-той platform руу HMAC гарын үсэгтэй webhook POST хийнэ; demo-д
   * loopback (гадаад дуудлагагүй, simulator хариулна).
   */
  private async dispatch(
    ctx: Ctx,
    request: RelayRequest,
    assignments: RelayAssignment[],
  ): Promise<void> {
    // Downstream platform-уудыг id-гаар нь НЭГ удаа уншиж (endpoint/secret авахад).
    const byId = new Map<string, RelayPlatform>();
    try {
      for (const p of await this.repo.listPlatforms(ctx)) byId.set(p.id, p);
    } catch (err) {
      logger.errorWithContext(ctx, 'relay: list platforms failed during dispatch', {
        error: logger.errText(err),
      });
    }

    for (const a of assignments) {
      try {
        await this.repo.markDispatched(ctx, a.id);
      } catch (err) {
        logger.errorWithContext(ctx, 'relay: mark dispatched failed', {
          error: logger.errText(err),
          assignment: a.id,
        });
        continue;
      }
      await this.event(
        ctx,
        a.requestId,
        a.id,
        RelayEvtDispatched,
        `Даалгавар дамжуулав: ${a.platformName}`,
      );
      const platform = byId.get(a.platformId);
      if (platform) {
        await deliverWebhook(ctx, platform, {
          event: RelayEvtDispatched,
          source_code: 'self',
          service_code: request.serviceCode,
          external_ref: request.externalRef,
          title: request.title,
          priority: request.priority,
          payload: request.payload,
          due_at: a.dueAt.toISOString(),
          sent_at: new Date().toISOString(),
        });
      }
    }
  }

  async respond(ctx: Ctx, assignmentId: string, input: RespondInput): Promise<void> {
    const status = input.status.trim();
    if (status !== RelayAsgDone && status !== RelayAsgRejected) {
      throw badRequest('status нь done эсвэл rejected байх ёстой');
    }
    const { request, fulfilled } = await this.repo.respondAssignment(
      ctx,
      assignmentId,
      status,
      input.result,
    );
    await this.event(
      ctx,
      request.id,
      assignmentId,
      RelayEvtResponded,
      `Доод platform хариулав: ${status}`,
    );
    if (fulfilled) {
      await this.event(
        ctx,
        request.id,
        null,
        RelayEvtFulfilled,
        'Бүх байгууллага хариулж, хүсэлт биелэгдлээ',
      );
      // Эх нь бүртгэлтэй дээд platform бол нэгтгэсэн хариуг webhook-оор дээш илгээнэ.
      await this.notifyUpstream(ctx, request, RelayEvtFulfilled);
    }
  }

  // ── Webhook (ирэх / дээш дамжуулах) ─────────────────────────────────

  async receiveWebhook(
    ctx: Ctx,
    sourceCode: string,
    signature: string,
    body: Buffer,
  ): Promise<RelayRequest> {
    const code = sourceCode.trim();
    if (code === '') throw badRequest(`${RelayWebhookSourceHeader} header шаардлагатай`);

    let platform: RelayPlatform;
    try {
      platform = await this.repo.getPlatformByCode(ctx, code);
    } catch {
      // "Байхгүй" ба "буруу гарын үсэг" нь ИЖИЛ 401 — бүртгэлтэй peer-үүдийн
      // жагсаалтыг тандах боломжгүй.
      throw unauthorized('тодорхойгүй эх platform');
    }
    if (!platform.enabled) throw forbidden('эх platform идэвхгүй байна');
    if (!relayVerifyWebhook(platform.webhookSecret, signature, body)) {
      throw unauthorized('webhook гарын үсэг таарахгүй байна');
    }

    let envelope: RelayWebhookEnvelope;
    try {
      envelope = JSON.parse(body.toString('utf8')) as RelayWebhookEnvelope;
    } catch {
      throw badRequest('webhook бие буруу байна');
    }

    return this.ingest(ctx, {
      sourcePlatform: platform.code,
      externalRef: envelope.external_ref ?? '',
      serviceCode: envelope.service_code ?? '',
      title: envelope.title ?? '',
      payload: envelope.payload ?? null,
      priority: envelope.priority ?? '',
      dueAt: envelope.due_at !== undefined ? new Date(envelope.due_at) : null,
    });
  }

  async forwardUp(ctx: Ctx, requestId: string, platformCode: string): Promise<void> {
    const code = platformCode.trim();
    if (requestId === '' || code === '') {
      throw badRequest('request_id болон platform_code шаардлагатай');
    }
    const platform = await this.repo.getPlatformByCode(ctx, code);
    if (platform.direction !== RelayDirUpstream) {
      throw badRequest('зөвхөн дээд (upstream) platform руу дамжуулна');
    }
    const detail = await this.repo.getRequestDetail(ctx, requestId);
    await this.forwardUpTo(
      ctx,
      platform,
      detail.request,
      RelayEvtForwardedUp,
      `Хүсэлтийг дээд platform руу дамжуулав: ${platform.name}`,
    );
  }

  /**
   * forwardUpTo нь request-ийг тухайн дээд platform руу webhook-оор илгээж,
   * timeline-д event нэмнэ (best-effort).
   */
  private async forwardUpTo(
    ctx: Ctx,
    platform: RelayPlatform,
    request: RelayRequest,
    event: string,
    detail: string,
  ): Promise<void> {
    await deliverWebhook(ctx, platform, {
      event,
      source_code: 'self',
      service_code: request.serviceCode,
      external_ref: request.externalRef,
      title: request.title,
      priority: request.priority,
      payload: request.payload,
      result: request.result,
      due_at: request.dueAt.toISOString(),
      sent_at: new Date().toISOString(),
    });
    await this.event(ctx, request.id, null, event, detail);
  }

  /**
   * notifyUpstream нь хүсэлтийн эх (sourcePlatform) нь бүртгэлтэй ДЭЭД platform
   * бол түүнд webhook илгээнэ (breach/fulfilled тайлагнах). Бүртгэлгүй бол
   * чимээгүй өнгөрнө (демо loopback гэх мэт).
   */
  private async notifyUpstream(ctx: Ctx, request: RelayRequest, event: string): Promise<void> {
    const code = request.sourcePlatform.trim();
    if (code === '') return;
    let platform: RelayPlatform;
    try {
      platform = await this.repo.getPlatformByCode(ctx, code);
    } catch {
      return;
    }
    if (platform.direction !== RelayDirUpstream || !platform.enabled) return;
    await deliverWebhook(ctx, platform, {
      event,
      source_code: 'self',
      service_code: request.serviceCode,
      external_ref: request.externalRef,
      title: request.title,
      result: request.result,
      sent_at: new Date().toISOString(),
    });
  }

  // ── SLA sweep (background worker-ийн нэг алхам) ─────────────────────

  async slaSweep(ctx: Ctx): Promise<void> {
    const now = new Date();

    // 1) Сануулга (шахалт) — SLA цонхны 75%/90% дээр downstream-д.
    try {
      for (const a of await this.repo.dueSoonAssignments(ctx)) {
        if (!a.dispatchedAt) continue;
        const need = relayRemindersDue(a.dispatchedAt, a.dueAt, now);
        let sent = a.remindersSent;
        while (sent < need) {
          try {
            await this.repo.incReminders(ctx, a.id);
          } catch {
            break;
          }
          sent++;
          await this.event(
            ctx,
            a.requestId,
            a.id,
            RelayEvtReminded,
            `Сануулга илгээв: ${a.platformName} — SLA хугацаа дөхөж байна`,
          );
        }
      }
    } catch (err) {
      logger.errorWithContext(ctx, 'relay sweep: due-soon query failed', {
        error: logger.errText(err),
      });
    }

    // 2) Хугацаа хэтэрсэн — overdue тэмдэглэх, дээд шат руу escalate, дээд
    //    platform-д breach мэдэгдэх (хүсэлт тус бүрд НЭГ УДАА).
    const breachSeen = new Set<string>();
    try {
      for (const a of await this.repo.overdueAssignments(ctx)) {
        if (a.status !== RelayAsgOverdue) {
          await this.repo.markAssignmentOverdue(ctx, a.id).catch(() => undefined);
          await this.event(
            ctx,
            a.requestId,
            a.id,
            RelayEvtOverdue,
            `Хугацаа хэтэрлээ: ${a.platformName}`,
          );
        }
        await this.repo.markRequestOverdue(ctx, a.requestId).catch(() => undefined);

        if (!a.escalated && now.getTime() > a.dueAt.getTime() + RelayEscalateGraceMs) {
          try {
            await this.repo.markEscalated(ctx, a.id);
            await this.event(
              ctx,
              a.requestId,
              a.id,
              RelayEvtEscalated,
              `Дээд шат (supervisor) руу escalate: ${a.platformName}`,
            );
          } catch {
            // Escalate тэмдэглэл амжилтгүй — дараагийн sweep дахин оролдоно.
          }
        }

        if (!breachSeen.has(a.requestId)) {
          breachSeen.add(a.requestId);
          let flipped = false;
          try {
            flipped = await this.repo.markBreachNotified(ctx, a.requestId);
          } catch {
            flipped = false;
          }
          if (flipped) {
            await this.event(
              ctx,
              a.requestId,
              null,
              RelayEvtBreachNotified,
              'Дээд platform-д SLA зөрчлийг мэдэгдэв',
            );
            try {
              const detail = await this.repo.getRequestDetail(ctx, a.requestId);
              await this.notifyUpstream(ctx, detail.request, RelayEvtBreachNotified);
            } catch {
              // Дэлгэрэнгүй уншиж чадаагүй — латч аль хэдийн тавигдсан тул
              // дахин мэдэгдэхгүй (давхар мэдэгдэхээс давуу).
            }
          }
        }
      }
    } catch (err) {
      logger.errorWithContext(ctx, 'relay sweep: overdue query failed', {
        error: logger.errText(err),
      });
    }
  }

  // ── Demo simulator (scaffold) ───────────────────────────────────────

  async simulateStep(ctx: Ctx): Promise<void> {
    const now = Date.now();
    let dueSoon: RelayAssignment[];
    try {
      dueSoon = await this.repo.dueSoonAssignments(ctx);
    } catch {
      return;
    }
    for (const a of dueSoon) {
      if (!a.dispatchedAt || now - a.dispatchedAt.getTime() < simulateHoldMs) continue;
      // Demo санамсаргүй байдал — аюулгүй байдалд хамаарахгүй.
      if (Math.random() * 100 < 60) {
        await this.respond(ctx, a.id, {
          status: RelayAsgDone,
          result: { ok: true, note: 'demo fulfilled' },
        }).catch(() => undefined);
      }
    }
    await this.simulateForwardUp(ctx);
  }

  /**
   * simulateForwardUp нь demo (scaffold) — сүүлийн биелэгдсэн хүсэлтүүдээс
   * хараахан дээш дамжуулаагүйг нь дээд demo peer руу forwardUp хийж, timeline-д
   * forwarded_up event үүсгэнэ. Нэг tick-д цөөхнийг (2) дамжуулж аажим харуулна.
   */
  private async simulateForwardUp(ctx: Ctx): Promise<void> {
    let platforms: RelayPlatform[];
    try {
      platforms = await this.repo.listPlatforms(ctx);
    } catch {
      return;
    }
    const upstream = platforms.find((p) => p.direction === RelayDirUpstream && p.enabled);
    if (!upstream) return;

    let requests: RelayRequest[];
    try {
      requests = await this.repo.listRequests(ctx, 30);
    } catch {
      return;
    }
    let forwarded = 0;
    for (const r of requests) {
      if (forwarded >= 2) break;
      if (r.status !== RelayReqFulfilled) continue;
      let detail: RelayRequestDetail;
      try {
        detail = await this.repo.getRequestDetail(ctx, r.id);
      } catch {
        continue;
      }
      if (detail.events.some((e) => e.type === RelayEvtForwardedUp)) continue;
      try {
        await this.forwardUp(ctx, r.id, upstream.code);
        forwarded++;
      } catch {
        // Дамжуулалт бүтэлгүйтвэл дараагийн tick дахин оролдоно.
      }
    }
  }

  async simulateIngest(ctx: Ctx): Promise<void> {
    let routes: RelayRoute[];
    try {
      routes = await this.repo.listRoutes(ctx);
    } catch {
      return;
    }
    if (routes.length === 0) return;
    const codes = [...new Set(routes.map((rt) => rt.serviceCode))];
    const code = codes[Math.floor(Math.random() * codes.length)];
    if (code === undefined) return;
    const ref = `DEMO-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
    await this.ingest(ctx, {
      sourcePlatform: 'e-mongolia',
      externalRef: ref,
      serviceCode: code,
      title: `Demo хүсэлт — ${code}`,
      payload: null,
      priority: 'normal',
      dueAt: new Date(Date.now() + simulateDemoWindowMs),
    }).catch(() => undefined);
  }

  // ── Dashboard + жагсаалт ────────────────────────────────────────────

  async overview(ctx: Ctx): Promise<RelayOverview> {
    return this.repo.overview(ctx);
  }

  async listRequests(ctx: Ctx, limit: number): Promise<RelayRequest[]> {
    const capped = limit <= 0 || limit > maxListLimit ? defaultListLimit : limit;
    return this.repo.listRequests(ctx, capped);
  }

  async getRequest(ctx: Ctx, id: string): Promise<RelayRequestDetail> {
    return this.repo.getRequestDetail(ctx, id);
  }

  // ── Platforms / routes (admin) ──────────────────────────────────────

  async listPlatforms(ctx: Ctx): Promise<RelayPlatform[]> {
    return this.repo.listPlatforms(ctx);
  }

  async createPlatform(ctx: Ctx, input: PlatformInput): Promise<RelayPlatform> {
    const code = input.code.trim();
    const name = input.name.trim();
    if (code === '' || name === '') throw badRequest('code болон name шаардлагатай');
    const direction = input.direction.trim() === '' ? RelayDirDownstream : input.direction.trim();
    if (direction !== RelayDirUpstream && direction !== RelayDirDownstream) {
      throw badRequest('direction нь upstream эсвэл downstream байх ёстой');
    }
    // Нууц өгөгдөөгүй бол өөрөө үүсгэнэ — секретгүй peer нь webhook-ийг
    // баталгаажуулж чадахгүй (verify нь хоосон нууц дээр ҮРГЭЛЖ false).
    const secret =
      input.webhookSecret.trim() === '' ? relayNewWebhookSecret() : input.webhookSecret.trim();
    return this.repo.createPlatform(ctx, {
      code,
      name,
      direction,
      endpointUrl: input.endpointUrl.trim(),
      supervisorContact: input.supervisorContact.trim(),
      webhookSecret: secret,
      enabled: input.enabled,
    });
  }

  async deletePlatform(ctx: Ctx, id: string): Promise<void> {
    return this.repo.deletePlatform(ctx, id);
  }

  async listRoutes(ctx: Ctx): Promise<RelayRoute[]> {
    return this.repo.listRoutes(ctx);
  }

  async createRoute(ctx: Ctx, input: RouteInput): Promise<RelayRoute> {
    const code = input.serviceCode.trim();
    if (code === '' || input.platformId.trim() === '') {
      throw badRequest('service_code болон platform_id шаардлагатай');
    }
    const sla = input.slaMinutes <= 0 ? defaultSlaMinutes : input.slaMinutes;
    return this.repo.createRoute(ctx, {
      serviceCode: code,
      platformId: input.platformId,
      slaMinutes: sla,
    });
  }

  async deleteRoute(ctx: Ctx, id: string): Promise<void> {
    return this.repo.deleteRoute(ctx, id);
  }
}

export const newRelayUsecase = (repo: RelayRepository): RelayUsecase => new RelayUsecaseImpl(repo);
