// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { SuperadminInvite } from '../../../domain/superadmin_account.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * SuperadminInviteRepository нь super admin болох урилгын (allow-list)
 * хадгалалт. Урилга нь эрхийг ШУУД олгодоггүй — зөвхөн onboarding шидтэнг
 * эхлүүлэх хаалгыг нээнэ.
 */
export interface SuperadminInviteRepository {
  list(ctx: Ctx): Promise<SuperadminInvite[]>;
  /** getByEmail нь и-мэйлээр урилгыг олно; байхгүй бол NotFound. */
  getByEmail(ctx: Ctx, email: string): Promise<SuperadminInvite>;
  /** create нь урилга нэмнэ; давхардсан и-мэйл дээр Conflict. */
  create(ctx: Ctx, email: string, invitedBy: string): Promise<SuperadminInvite>;
  /** deleteInvite нь урилгыг цуцална; байхгүй бол NotFound. */
  deleteInvite(ctx: Ctx, email: string): Promise<void>;
  /**
   * markAccepted нь урилгыг ашигласан гэж тэмдэглэнэ (onboarding төгсөхөд).
   * `accepted_at IS NULL` нөхцөл нь дахин тэмдэглэхээс сэргийлнэ.
   */
  markAccepted(ctx: Ctx, email: string): Promise<void>;
}
