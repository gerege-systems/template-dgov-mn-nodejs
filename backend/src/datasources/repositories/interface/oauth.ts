// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { OAuthClient } from '../../../domain/oauth.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * OAuthClientRepository нь oauth_clients хүснэгтийн gateway. Энэ нь системийн
 * ТОХИРГООНЫ хүснэгт (хэрэглэгч-тус-бүрийн БИШ) тул RLS-гүй — зөвшөөрлийг
 * route давхарга (gateway.manage) шийднэ.
 */
export interface OAuthClientRepository {
  list(ctx: Ctx): Promise<OAuthClient[]>;
  get(ctx: Ctx, clientId: string): Promise<OAuthClient>;
  create(ctx: Ctx, client: OAuthClient): Promise<OAuthClient>;
  /**
   * update нь client-ын тохиргоог шинэчилнэ. secret_hash-д ХҮРЭХГҮЙ — түүнийг
   * зөвхөн setSecretHash сольж чадна (санамсаргүй secret устгахаас сэргийлнэ).
   */
  update(ctx: Ctx, client: OAuthClient): Promise<OAuthClient>;
  setSecretHash(ctx: Ctx, clientId: string, hash: string): Promise<void>;
  deleteClient(ctx: Ctx, clientId: string): Promise<void>;
}

/**
 * ServiceScopeResolver нь gateway service id ↔ OAuth scope хооронд хөрвүүлнэ
 * (gateway_services.scope багана).
 */
export interface ServiceScopeResolver {
  serviceScopes(ctx: Ctx, serviceIds: string[]): Promise<string[]>;
  serviceIdsForScopes(ctx: Ctx, scopes: string[]): Promise<string[]>;
}
