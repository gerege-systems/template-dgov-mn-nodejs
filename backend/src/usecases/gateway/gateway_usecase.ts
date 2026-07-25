// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/gateway нь API Gateway-ийн admin удирдлагын бизнес логик — upstream
// service-үүдийн CRUD, dashboard-ийн нэгтгэл болон бодит хүсэлтийн лог бичилт.

import { badRequest } from '../../apperror/index.js';
import type { GatewayRepository } from '../../datasources/repositories/interface/gateway.js';
import type { GatewayOverview, GatewayRequestLog, GatewayService } from '../../domain/gateway.js';
import { cleanTags } from '../../domain/gateway.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';

/** defaultLogLimit / maxLogLimit нь лог жагсаалтын хуудаслалт. */
const defaultLogLimit = 100;
const maxLogLimit = 200;

/** ServiceInput нь service үүсгэх/шинэчлэх түүхий оролт (хэвийшүүлэхээс өмнө). */
export interface ServiceInput {
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

/** RequestLogInput нь middleware-ээс ирэх бодит хүсэлтийн бичлэг. */
export interface RequestLogInput {
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  clientIp: string;
}

export interface GatewayUsecase {
  listServices(ctx: Ctx): Promise<GatewayService[]>;
  createService(ctx: Ctx, input: ServiceInput): Promise<GatewayService>;
  updateService(ctx: Ctx, id: string, input: ServiceInput): Promise<GatewayService>;
  deleteService(ctx: Ctx, id: string): Promise<void>;

  listRequestLogs(ctx: Ctx, limit: number): Promise<GatewayRequestLog[]>;
  overview(ctx: Ctx): Promise<GatewayOverview>;
  /**
   * recordRequest нь middleware-ээс ирсэн бодит хүсэлтийг лог-д бичнэ.
   * BEST-EFFORT: алдааг залгина — лог бичилт хэрэглэгчийн хүсэлтийг блоклохгүй.
   */
  recordRequest(ctx: Ctx, input: RequestLogInput): void;
}

/**
 * normalize нь оролтыг хэвийшүүлнэ: протокол http/https биш бол https, порт
 * хүрээнээс гарвал протоколын өгөгдмөл, зам хоосон бол "/", timeout тэг бол 60с.
 * Ингэснээр админ дутуу форм илгээсэн ч ажиллах чадвартай мөр үүснэ.
 */
function normalize(input: ServiceInput): ServiceInput {
  const name = input.name.trim();
  const host = input.host.trim();
  if (name === '') throw badRequest('service name is required');
  if (host === '') throw badRequest('service host is required');

  const protocol = input.protocol.trim().toLowerCase();
  const proto = protocol === 'http' || protocol === 'https' ? protocol : 'https';
  const port = input.port > 0 && input.port <= 65535 ? input.port : proto === 'http' ? 80 : 443;
  const path = input.path.trim() === '' ? '/' : input.path.trim();

  return {
    name,
    protocol: proto,
    host,
    port,
    path,
    retries: input.retries < 0 ? 0 : input.retries,
    connectTimeout: input.connectTimeout <= 0 ? 60_000 : input.connectTimeout,
    tags: cleanTags(input.tags),
    enabled: input.enabled,
  };
}

class GatewayUsecaseImpl implements GatewayUsecase {
  constructor(private readonly repo: GatewayRepository) {}

  async listServices(ctx: Ctx): Promise<GatewayService[]> {
    return await this.repo.listServices(ctx);
  }

  async createService(ctx: Ctx, input: ServiceInput): Promise<GatewayService> {
    return await this.repo.createService(ctx, normalize(input));
  }

  async updateService(ctx: Ctx, id: string, input: ServiceInput): Promise<GatewayService> {
    return await this.repo.updateService(ctx, id, normalize(input));
  }

  async deleteService(ctx: Ctx, id: string): Promise<void> {
    await this.repo.deleteService(ctx, id);
  }

  async listRequestLogs(ctx: Ctx, limit: number): Promise<GatewayRequestLog[]> {
    const lim = limit <= 0 || limit > maxLogLimit ? defaultLogLimit : limit;
    return await this.repo.listRequestLogs(ctx, lim);
  }

  async overview(ctx: Ctx): Promise<GatewayOverview> {
    return await this.repo.overview(ctx);
  }

  recordRequest(ctx: Ctx, input: RequestLogInput): void {
    // Best-effort: алдааг залгина. `void` + catch — floating promise үлдээвэл
    // процесс унших эрсдэлтэй тул ил барина.
    void this.repo
      .createRequestLog(ctx, {
        method: input.method,
        path: input.path,
        status: input.status,
        latencyMs: input.latencyMs,
        clientIp: input.clientIp,
      })
      .catch((err: unknown) => {
        logger.warn('gateway request log write failed', { error: logger.errText(err) });
      });
  }
}

export const newGatewayUsecase = (repo: GatewayRepository): GatewayUsecase =>
  new GatewayUsecaseImpl(repo);
