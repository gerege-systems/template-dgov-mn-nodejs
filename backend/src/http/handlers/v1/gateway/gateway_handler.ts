// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /gateway/* endpoint-ууд — API Gateway-ийн admin гадаргуу: upstream
// service-үүдийн CRUD + телеметр (overview / хүсэлтийн лог). Бүгд
// `gateway.manage` эрх шаардана (route_gateway.ts).

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { GatewayUsecase } from '../../../../usecases/gateway/gateway_usecase.js';
import {
  gatewayLogListResponse,
  gatewayOverviewResponse,
  gatewayServiceListResponse,
  gatewayServiceResponse,
} from '../../../dto/responses/gateway.js';
import { decodeBody, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * serviceSchema нь upstream service-ийн body. Дутуу талбарууд (protocol/port/
 * path/timeout) нь usecase давхаргад ХЭВИЙШИНЭ — админ дутуу форм илгээсэн ч
 * ажиллах чадвартай мөр үүснэ.
 */
const serviceSchema = strictObject({
  name: z.string().min(2).max(80),
  protocol: z.enum(['http', 'https']).optional(),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional(),
  path: z.string().max(255).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  connect_timeout_ms: z.number().int().min(100).max(600_000).optional(),
  tags: z.array(z.string().max(40)).optional(),
  enabled: z.boolean().optional(),
});

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

/** parseIntDefault нь query-г бүхэл тоо болгоно; буруу бол өгөгдмөл (400 БИШ). */
function parseIntDefault(req: Request, key: string, def: number): number {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

type ServiceBody = z.infer<typeof serviceSchema>;

/** toInput нь HTTP body-г usecase-ийн оролт болгоно (өгөгдмөлүүдийг usecase шийднэ). */
const toInput = (b: ServiceBody) => ({
  name: b.name,
  protocol: b.protocol ?? '',
  host: b.host,
  port: b.port ?? 0,
  path: b.path ?? '',
  retries: b.retries ?? 0,
  connectTimeout: b.connect_timeout_ms ?? 0,
  tags: b.tags ?? [],
  enabled: b.enabled ?? true,
});

export class GatewayHandler {
  constructor(private readonly usecase: GatewayUsecase) {}

  /** GET /gateway/overview · Bearer + gateway.manage · 200 */
  overview: AsyncHandler = async (req, res) => {
    const o = await this.usecase.overview(req.ctx);
    newSuccessResponse(req, res, 200, 'gateway overview', gatewayOverviewResponse(o));
  };

  /** GET /gateway/logs?limit= · Bearer + gateway.manage · 200 */
  listLogs: AsyncHandler = async (req, res) => {
    const logs = await this.usecase.listRequestLogs(req.ctx, parseIntDefault(req, 'limit', 100));
    newSuccessResponse(req, res, 200, 'gateway logs', gatewayLogListResponse(logs));
  };

  /** GET /gateway/services · Bearer + gateway.manage · 200 */
  listServices: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listServices(req.ctx);
    newSuccessResponse(req, res, 200, 'gateway services', gatewayServiceListResponse(list));
  };

  /** POST /gateway/services · Bearer + gateway.manage · 201 · 400 · 409 · 422 */
  createService: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, serviceSchema);
    const svc = await this.usecase.createService(req.ctx, toInput(body));
    newSuccessResponse(req, res, 201, 'service created', gatewayServiceResponse(svc));
  };

  /** PUT /gateway/services/:id · Bearer + gateway.manage · 200 · 404 · 409 · 422 */
  updateService: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, serviceSchema);
    const svc = await this.usecase.updateService(req.ctx, pathParam(req, 'id'), toInput(body));
    newSuccessResponse(req, res, 200, 'service updated', gatewayServiceResponse(svc));
  };

  /** DELETE /gateway/services/:id · Bearer + gateway.manage · 200 · 404 */
  deleteService: AsyncHandler = async (req, res) => {
    await this.usecase.deleteService(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'service deleted');
  };
}

export const newGatewayHandler = (usecase: GatewayUsecase): GatewayHandler =>
  new GatewayHandler(usecase);
