// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/rbac нь динамик эрх (roles) + эрхийн каталог (permissions)-ийг
// удирдаж, нэг role-ийн эрхүүдийг (enforcement-д зориулж) тооцоолж/кэшлэнэ.

import type { Permission, Role } from '../../domain/rbac.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/** RoleWithPerms нь RBAC matrix-д зориулсан role + түүний эрхийн түлхүүрүүд. */
export interface RoleWithPerms {
  role: Role;
  permissions: string[];
}

export interface CreateRoleRequest {
  key: string;
  name: string;
  description: string;
  /** undefined бол эрхийг огт оноохгүй. */
  permissions?: string[];
}

export interface UpdateRoleRequest {
  id: number;
  name: string;
  description: string;
  /** undefined бол эрхийг ХӨНДӨХГҮЙ (name/description-г л шинэчилнэ). */
  permissions?: string[];
}

export interface RBACUsecase {
  /**
   * listRoles нь эрх бүрийг түүнд оноогдсон permission түлхүүрүүдтэй нь буцаана
   * (RBAC matrix-д).
   */
  listRoles(ctx: Ctx): Promise<RoleWithPerms[]>;
  createRole(ctx: Ctx, req: CreateRoleRequest): Promise<Role>;
  updateRole(ctx: Ctx, req: UpdateRoleRequest): Promise<Role>;
  deleteRole(ctx: Ctx, id: number): Promise<void>;
  listPermissions(ctx: Ctx): Promise<Permission[]>;
  setRolePermissions(ctx: Ctx, roleId: number, keys: string[]): Promise<void>;
  /**
   * resolve нь нэг role-ийн эрхийн түлхүүрүүдийг буцаана (кэштэй). 'admin' болон
   * 'superadmin' эрх нь каталогийн БҮХ эрхийг автоматаар авна.
   *
   * Энэ нь middleware-ийн PermissionResolver гэрээг хангадаг тул
   * requirePermission нь шууд үүнийг хэрэглэнэ.
   */
  resolve(ctx: Ctx, roleId: number): Promise<string[]>;
}
