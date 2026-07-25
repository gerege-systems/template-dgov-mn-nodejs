// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  GatewayOverview,
  GatewayRequestLog,
  GatewayService,
} from '../../../domain/gateway.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** NewGatewayService нь service үүсгэх/шинэчлэхэд шаардлагатай талбарууд. */
export interface NewGatewayService {
  name: string;
  protocol: string;
  host: string;
  port: number;
  path: string;
  retries: number;
  connectTimeout: number;
  tags: string[];
  enabled: boolean;
}

/**
 * GatewayRepository нь gateway_services + gateway_request_logs хүснэгтүүдийн
 * gateway. Хэрэглэгч-тус-бүрийн БИШ тохиргоо/телеметр тул RLS-гүй (rbac-тай
 * ижил ангилал).
 */
export interface GatewayRepository {
  listServices(ctx: Ctx): Promise<GatewayService[]>;
  getService(ctx: Ctx, id: string): Promise<GatewayService>;
  createService(ctx: Ctx, input: NewGatewayService): Promise<GatewayService>;
  updateService(ctx: Ctx, id: string, input: NewGatewayService): Promise<GatewayService>;
  deleteService(ctx: Ctx, id: string): Promise<void>;

  listRequestLogs(ctx: Ctx, limit: number): Promise<GatewayRequestLog[]>;
  /** createRequestLog нь бодит хүсэлтийг лог-д бичнэ (middleware-ээс). */
  createRequestLog(ctx: Ctx, log: Omit<GatewayRequestLog, 'id' | 'createdAt'>): Promise<void>;
  overview(ctx: Ctx): Promise<GatewayOverview>;
}
