// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Permission, Role } from '../../../domain/rbac.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * RBACRepository нь roles / permissions / role_permissions хүснэгтүүдийн gateway.
 * Эдгээр нь хэрэглэгч-тус-бүрийн БИШ лавлах өгөгдөл тул RLS-д хамаарахгүй.
 * Цорын ганц онцгой тохиолдол нь countUsersWithRole — RLS-тэй users хүснэгтэд
 * хүрдэг тул "service" identity шаардана.
 */
export interface RBACRepository {
  listRoles(ctx: Ctx): Promise<Role[]>;
  /** getRole нь id-аар эрхийг буцаана; байхгүй бол apperror.notFound. */
  getRole(ctx: Ctx, id: number): Promise<Role>;
  /** createRole нь шинэ (is_system=false) эрх үүсгэнэ; давхардсан key → conflict. */
  createRole(ctx: Ctx, input: Pick<Role, 'key' | 'name' | 'description'>): Promise<Role>;
  /** updateRole нь ЗӨВХӨН name/description-г шинэчилнэ (key, is_system хөндөгдөхгүй). */
  updateRole(ctx: Ctx, input: Pick<Role, 'id' | 'name' | 'description'>): Promise<Role>;
  /** deleteRole нь системийн эрхийг (is_system=true) устгуулахгүй. */
  deleteRole(ctx: Ctx, id: number): Promise<void>;
  /**
   * countUsersWithRole нь тухайн эрхтэй амьд хэрэглэгчийн тоог буцаана.
   * users нь RLS-тэй тул "service" identity дор тоолно — эс бөгөөс app role
   * 0 хардаг бөгөөд ашиглагдаж буй эрхийг алдаатай устгуулна.
   */
  countUsersWithRole(ctx: Ctx, roleId: number): Promise<number>;
  listPermissions(ctx: Ctx): Promise<Permission[]>;
  getRolePermissions(ctx: Ctx, roleId: number): Promise<string[]>;
  /**
   * setRolePermissions нь эрхийн багцыг БҮХЭЛД НЬ солино (replace) — нэг
   * транзакцид хуучныг устгаж, шинийг оруулна. Зөвхөн каталогт байгаа түлхүүрийг
   * зөвшөөрнө (permissions.key FK баталгаажуулна).
   */
  setRolePermissions(ctx: Ctx, roleId: number, keys: string[]): Promise<void>;
}
