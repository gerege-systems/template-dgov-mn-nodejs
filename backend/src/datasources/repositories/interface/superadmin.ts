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

/** RecoveryCode нь 2FA нөөц кодын хадгалагдсан хэлбэр (зөвхөн hash). */
export interface RecoveryCode {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * RecoveryCodeRepository нь 2FA нөөц кодуудын (user_recovery_codes) gateway.
 * Кодууд нь per-user тул хүснэгт RLS-тэй. DB-д ЗӨВХӨН SHA-256 hash
 * хадгалагдана — энгийн текст код энэ давхаргад ХЭЗЭЭ Ч хүрэхгүй.
 */
export interface RecoveryCodeRepository {
  /**
   * replace нь тухайн хэрэглэгчийн ӨМНӨХ бүх кодыг устгаад шинэ hash-уудыг
   * НЭГ транзакцид оруулна (дахин үүсгэх нь хуучныг хүчингүй болгоно).
   */
  replace(ctx: Ctx, userId: string, hashes: string[]): Promise<void>;
  /** listActive нь хэрэглэгдээгүй (used_at IS NULL) кодуудыг буцаана. */
  listActive(ctx: Ctx, userId: string): Promise<RecoveryCode[]>;
  /**
   * consume нь өгсөн hash-тай, хэрэглэгдээгүй НЭГ кодыг АТОМААР "хэрэглэсэн"
   * болгож тэмдэглэнэ. Тохирох идэвхтэй код байхгүй бол NotFound — иймээс код
   * нэг л удаа ажиллана.
   */
  consume(ctx: Ctx, userId: string, hash: string): Promise<void>;
}
