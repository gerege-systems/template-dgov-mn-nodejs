// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// gateway_services.scope багана дээрх хөрвүүлэгч — gateway service id ↔ OAuth
// scope. Applications домэйн аппын "зөвшөөрсөн service"-үүдийг OAuth scope
// болгож хадгалдаг тул хоёр чиглэлд хөрвүүлэх шаардлагатай.
//
// RLS-гүй тохиргооны хүснэгт (gateway_services-тэй ижил ангилал).

import { badRequest, internalCause } from '../../../../apperror/index.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import { pgErrorCode, type Db } from '../../../drivers/pg.js';
import type { ServiceScopeResolver } from '../../interface/oauth.js';

/** mapErr нь Postgres алдааг домэйн алдаа болгоно. */
function mapErr(err: unknown): Error {
  switch (pgErrorCode(err)) {
    case '23503':
      return badRequest('unknown service id');
    case '22P02':
      // Буруу uuid нь 500 БИШ — админы форм алдаа.
      return badRequest('invalid id format');
    default:
      return internalCause(err);
  }
}

class ServiceScopePostgres implements ServiceScopeResolver {
  constructor(private readonly db: Db) {}

  async serviceScopes(ctx: Ctx, serviceIds: string[]): Promise<string[]> {
    if (serviceIds.length === 0) return [];
    try {
      const res = await this.db.query<{ scope: string }>(
        ctx,
        `SELECT scope FROM gateway_services WHERE id = ANY($1::uuid[]) AND scope <> ''`,
        [serviceIds],
      );
      return res.rows.map((r) => r.scope);
    } catch (err) {
      throw mapErr(err);
    }
  }

  /**
   * serviceIdsForScopes нь өгсөн OAuth scope нэрсэд харгалзах service id-уудыг
   * буцаана (serviceScopes-ийн УРВУУ). Client-ийн scope-оос апп-ын зөвшөөрсөн
   * service-үүдийг сэргээхэд ашиглана.
   */
  async serviceIdsForScopes(ctx: Ctx, scopes: string[]): Promise<string[]> {
    if (scopes.length === 0) return [];
    try {
      const res = await this.db.query<{ id: string }>(
        ctx,
        `SELECT id::text AS id FROM gateway_services WHERE scope = ANY($1) AND scope <> ''`,
        [scopes],
      );
      return res.rows.map((r) => r.id);
    } catch (err) {
      throw mapErr(err);
    }
  }
}

export const newServiceScopeResolver = (db: Db): ServiceScopeResolver =>
  new ServiceScopePostgres(db);
