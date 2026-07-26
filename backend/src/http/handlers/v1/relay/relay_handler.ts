// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /relay/* endpoint-ууд — platform-хоорондын хүсэлт дамжуулах + SLA хяналт.
// Ingest/respond нь m2m урсгал (scaffold-д relay.manage эрхээр); dashboard/CRUD
// нь relay.view / relay.manage. Peer webhook нь JWT-ГҮЙ, HMAC гарын үсгээр
// баталгаажна.

import { z } from 'zod';

import { RelayWebhookSigHeader, RelayWebhookSourceHeader } from '../../../../domain/relay.js';
import { strictObject } from '../../../../pkg/validators/validators.js';
import type { RelayUsecase } from '../../../../usecases/relay/relay_usecase.js';
import {
  relayOverviewResponse,
  relayPlatformListResponse,
  relayPlatformResponse,
  relayRequestDetailResponse,
  relayRequestListResponse,
  relayRequestResponse,
  relayRouteListResponse,
  relayRouteResponse,
} from '../../../dto/responses/relay.js';
import { decodeBody, newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/** ingestSchema нь дээд platform-оос ирэх хүсэлт (m2m). */
const ingestSchema = strictObject({
  source_platform: z.string().max(120).optional(),
  external_ref: z.string().max(120).optional(),
  service_code: z.string().min(1).max(120),
  title: z.string().max(300).optional(),
  payload: z.unknown().optional(),
  priority: z.string().max(40).optional(),
  due_at: z.string().datetime({ offset: true }).optional(),
});

/** respondSchema нь доод platform-ын callback (m2m). */
const respondSchema = strictObject({
  status: z.enum(['done', 'rejected']),
  result: z.unknown().optional(),
});

/** platformSchema нь peer platform бүртгэх (admin). */
const platformSchema = strictObject({
  code: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  direction: z.enum(['upstream', 'downstream']).optional(),
  endpoint_url: z.string().max(500).optional(),
  supervisor_contact: z.string().max(300).optional(),
  webhook_secret: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
});

/** routeSchema нь чиглүүлэлт (service_code → platform) үүсгэх (admin). */
const routeSchema = strictObject({
  service_code: z.string().min(1).max(120),
  platform_id: z.string().uuid(),
  sla_minutes: z.number().int().optional(),
});

/** forwardSchema нь хүсэлтийг дээд platform руу дамжуулах (admin). */
const forwardSchema = strictObject({ platform_code: z.string().min(1).max(120) });

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

const queryInt = (req: Request, key: string): number => {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
};

export class RelayHandler {
  constructor(private readonly usecase: RelayUsecase) {}

  // ── Ingest / respond (m2m) ──────────────────────────────────────────

  /**
   * ingest нь дээд platform-оос ирсэн хугацаатай хүсэлтийг хүлээж авч,
   * service_code-ийн routing дүрмээр доод platform-ууд руу дамжуулна.
   *
   * POST /relay/requests · Bearer + relay.manage · 201 · 400 · 401 · 403 · 422
   */
  ingest: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, ingestSchema);
    const out = await this.usecase.ingest(req.ctx, {
      sourcePlatform: body.source_platform ?? '',
      externalRef: body.external_ref ?? '',
      serviceCode: body.service_code,
      title: body.title ?? '',
      payload: body.payload ?? null,
      priority: body.priority ?? '',
      dueAt: body.due_at !== undefined ? new Date(body.due_at) : null,
    });
    newSuccessResponse(req, res, 201, 'request accepted', relayRequestResponse(out));
  };

  /**
   * respond нь доод platform-ын callback — даалгаврыг терминал болгоно.
   * Давхар хариу нь 409 (уралдааныг DB-ийн WHERE guard барина).
   *
   * POST /relay/assignments/:id/respond · Bearer + relay.manage · 200 · 400 · 409
   */
  respond: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, respondSchema);
    await this.usecase.respond(req.ctx, pathParam(req, 'id'), {
      status: body.status,
      result: body.result ?? null,
    });
    newSuccessResponse(req, res, 200, 'response recorded');
  };

  /**
   * receiveWebhook нь бүртгэлтэй peer platform-оос ирсэн webhook-ийг
   * `X-Relay-Source` + `X-Relay-Signature` (HMAC-SHA256)-аар баталгаажуулж,
   * шинэ хүсэлт болгон ingest хийнэ. JWT ШААРДАХГҮЙ — гарын үсэг нь итгэлийн
   * цорын ганц үндэс тул түүхий (raw) body дээр шалгагдана.
   *
   * POST /relay/webhook · HMAC · 201 · 400 · 401 · 403
   */
  receiveWebhook: AsyncHandler = async (req, res) => {
    // express.raw нь энэ замд body-г Buffer болгож үлдээнэ (JSON parser нь
    // аль хэдийн задлагдсан body-г алгасдаг) — гарын үсэг ЯГ илгээсэн байт
    // дээр шалгагдана, дахин цувуулсан (re-serialized) JSON дээр биш.
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body)) {
      newErrorResponse(req, res, 400, 'webhook бие уншиж чадсангүй');
      return;
    }
    const out = await this.usecase.receiveWebhook(
      req.ctx,
      req.get(RelayWebhookSourceHeader) ?? '',
      req.get(RelayWebhookSigHeader) ?? '',
      body,
    );
    newSuccessResponse(req, res, 201, 'webhook accepted', relayRequestResponse(out));
  };

  /**
   * forwardUp нь хүсэлтийг сонгосон дээд (upstream) platform руу webhook-оор
   * дамжуулна.
   *
   * POST /relay/requests/:id/forward · Bearer + relay.manage · 200 · 400 · 404
   */
  forwardUp: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, forwardSchema);
    await this.usecase.forwardUp(req.ctx, pathParam(req, 'id'), body.platform_code);
    newSuccessResponse(req, res, 200, 'forwarded upstream');
  };

  // ── Dashboard (relay.view) ──────────────────────────────────────────

  /** GET /relay/overview · Bearer + relay.view · 200 */
  overview: AsyncHandler = async (req, res) => {
    const out = await this.usecase.overview(req.ctx);
    newSuccessResponse(req, res, 200, 'overview fetched', relayOverviewResponse(out));
  };

  /** GET /relay/requests · Bearer + relay.view · 200 */
  listRequests: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listRequests(req.ctx, queryInt(req, 'limit'));
    newSuccessResponse(req, res, 200, 'requests fetched', relayRequestListResponse(list));
  };

  /** GET /relay/requests/:id · Bearer + relay.view · 200 · 404 */
  getRequest: AsyncHandler = async (req, res) => {
    const out = await this.usecase.getRequest(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'request fetched', relayRequestDetailResponse(out));
  };

  // ── Platforms / routes (admin) ──────────────────────────────────────

  /** GET /relay/platforms · Bearer + relay.view · 200 */
  listPlatforms: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listPlatforms(req.ctx);
    newSuccessResponse(req, res, 200, 'platforms fetched', relayPlatformListResponse(list));
  };

  /** POST /relay/platforms · Bearer + relay.manage · 201 · 400 · 409 */
  createPlatform: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, platformSchema);
    const out = await this.usecase.createPlatform(req.ctx, {
      code: body.code,
      name: body.name,
      direction: body.direction ?? '',
      endpointUrl: body.endpoint_url ?? '',
      supervisorContact: body.supervisor_contact ?? '',
      webhookSecret: body.webhook_secret ?? '',
      enabled: body.enabled ?? false,
    });
    newSuccessResponse(req, res, 201, 'platform created', relayPlatformResponse(out));
  };

  /** DELETE /relay/platforms/:id · Bearer + relay.manage · 200 · 404 */
  deletePlatform: AsyncHandler = async (req, res) => {
    await this.usecase.deletePlatform(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'platform deleted');
  };

  /** GET /relay/routes · Bearer + relay.view · 200 */
  listRoutes: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listRoutes(req.ctx);
    newSuccessResponse(req, res, 200, 'routes fetched', relayRouteListResponse(list));
  };

  /** POST /relay/routes · Bearer + relay.manage · 201 · 400 · 409 */
  createRoute: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, routeSchema);
    const out = await this.usecase.createRoute(req.ctx, {
      serviceCode: body.service_code,
      platformId: body.platform_id,
      slaMinutes: body.sla_minutes ?? 0,
    });
    newSuccessResponse(req, res, 201, 'route created', relayRouteResponse(out));
  };

  /** DELETE /relay/routes/:id · Bearer + relay.manage · 200 · 404 */
  deleteRoute: AsyncHandler = async (req, res) => {
    await this.usecase.deleteRoute(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'route deleted');
  };
}

export const newRelayHandler = (usecase: RelayUsecase): RelayHandler => new RelayHandler(usecase);
