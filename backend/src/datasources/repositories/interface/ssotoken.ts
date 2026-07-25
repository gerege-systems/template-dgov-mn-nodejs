// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { SSOToken } from '../../../domain/sso_token.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

export type { SSOToken };

/**
 * SSOTokenRepository нь иргэний SSO OAuth токенуудыг (шифрлэсэн) хадгалах
 * gateway. Adapter нь токенуудыг шифрлэж/тайлж, зөвхөн шифр текстийг DB-д
 * байлгана.
 */
export interface SSOTokenRepository {
  upsert(ctx: Ctx, userId: string, tok: SSOToken): Promise<void>;
  /** get нь хадгалагдсан токенуудыг (тайлсан) буцаана; байхгүй бол ErrSSOTokenNotFound. */
  get(ctx: Ctx, userId: string): Promise<SSOToken>;
}
