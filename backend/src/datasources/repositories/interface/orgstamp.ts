// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * OrgStampRepository нь байгууллагын тамганы дардасын зургийн URL-ийг улсын
 * бүртгэлийн дугаараар (org_register) хадгалах gateway.
 *
 * Эрхийн шалгалт (зөвхөн ADMIN тавьж/устгах) нь usecase давхаргад eID-ээр
 * хийгдэнэ — энэ давхарга ямар ч эрх ШАЛГАДАГГҮЙ.
 */
export interface OrgStampRepository {
  /** get нь тамганы URL-ийг буцаана; тавиагүй бол "". */
  get(ctx: Ctx, orgRegister: string): Promise<string>;
  /** upsert нь тамганы URL-ийг тавина/шинэчилнэ (uploadedBy — тавьсан хэрэглэгч). */
  upsert(ctx: Ctx, orgRegister: string, url: string, uploadedBy: string): Promise<void>;
  /** deleteStamp нь тамгыг устгана. */
  deleteStamp(ctx: Ctx, orgRegister: string): Promise<void>;
}
