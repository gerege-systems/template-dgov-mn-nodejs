// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { z } from 'zod';

import { strictObject } from '../../../pkg/validators/validators.js';

/** permissionKeys нь эрхийн түлхүүрүүдийн массив (элемент бүр ≤40 тэмдэгт). */
const permissionKeys = z.array(z.string().max(40)).max(200);

/**
 * createRoleSchema нь POST /rbac/roles-ийн body. key хоосон бол name-ээс гаргана
 * (usecase slugify хийнэ).
 */
export const createRoleSchema = strictObject({
  key: z.string().max(40).optional(),
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  permissions: permissionKeys.optional(),
});
export type CreateRoleBody = z.infer<typeof createRoleSchema>;

/**
 * updateRoleSchema нь PUT /rbac/roles/:id-ийн body.
 *
 * `permissions` БАЙХГҮЙ бол эрхийг ХӨНДӨХГҮЙ; хоосон массив бол "бүх эрхийг хас"
 * гэсэн ТОДОРХОЙ хүсэл. Энэ хоёрыг ялгах нь чухал тул optional-ийг nullable-аас
 * тусад нь барина.
 */
export const updateRoleSchema = strictObject({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  permissions: permissionKeys.optional(),
});
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>;

/** setRolePermissionsSchema нь PUT /rbac/roles/:id/permissions-ийн body. */
export const setRolePermissionsSchema = strictObject({
  permissions: permissionKeys.optional(),
});
export type SetRolePermissionsBody = z.infer<typeof setRolePermissionsSchema>;
