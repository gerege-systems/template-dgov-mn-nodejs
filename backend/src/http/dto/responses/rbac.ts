// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Permission, Role } from '../../../domain/rbac.js';
import type { RoleWithPerms } from '../../../usecases/rbac/rbac_usecase.js';

/** RoleResponse нь RBAC matrix-ийн нэг мөр. */
export interface RoleResponse {
  id: number;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
}

/** PermissionResponse нь эрхийн каталогийн нэг бичлэг. */
export interface PermissionResponse {
  key: string;
  label: string;
  category: string;
}

/**
 * roleResponse нь permission-гүй (эсвэл тусдаа оноох) role-г буцаана. permissions
 * нь ҮРГЭЛЖ массив — клиент null шалгах шаардлагагүй.
 */
export function roleResponse(r: Role): RoleResponse {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    is_system: r.isSystem,
    permissions: [],
  };
}

/** roleListResponse нь RBAC matrix-д зориулж role бүрийг эрхүүдтэй нь буцаана. */
export function roleListResponse(list: RoleWithPerms[]): RoleResponse[] {
  return list.map((rp) => ({
    id: rp.role.id,
    key: rp.role.key,
    name: rp.role.name,
    description: rp.role.description,
    is_system: rp.role.isSystem,
    permissions: rp.permissions,
  }));
}

/** permissionListResponse нь эрхийн каталогийг буцаана. */
export function permissionListResponse(list: Permission[]): PermissionResponse[] {
  return list.map((p) => ({ key: p.key, label: p.label, category: p.category }));
}
