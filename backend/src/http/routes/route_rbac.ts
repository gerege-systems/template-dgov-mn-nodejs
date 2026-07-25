// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermRolesManage } from '../../domain/rbac.js';
import { newRBACHandler } from '../handlers/v1/rbac/rbac_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerRBACRoutes нь /rbac/* бүлгийг холбоно.
 *
 * `/rbac/me` нь нэвтэрсэн хэрэглэгч БҮРТ нээлттэй (өөрийн эрхээ авах — frontend
 * цэсээ шүүхэд); бусад нь `roles.manage` эрх шаардана (admin автоматаар давна).
 *
 * ⚠️ Middleware-ийг route ТУС БҮРД ил дамжуулна — Express-д `router.use()` нь
 * тэр цэгээс хойших бүх хүсэлтэд хэрэгждэг тул chi-ийн `Group`-той адилгүй
 * (route_auth.ts дахь тайлбарыг үз).
 */
export function registerRBACRoutes(router: Router, deps: Deps): void {
  const handler = newRBACHandler(deps.rbacUC);

  const rbac = Router();
  // Бүх /rbac/* route нэвтрэлт шаардана.
  rbac.use(deps.authMiddleware);

  // Нэвтэрсэн хэрэглэгч бүр өөрийн эрхүүдээ авч болно.
  rbac.get('/me', wrap(handler.myPermissions));

  // Удирдлага — 'roles.manage' эрх шаардана. Resolver нь rbac usecase өөрөө
  // (кэштэй) тул эрх шалгалт нэг л эх сурвалжаас гарна.
  const manage = requirePermission(deps.rbacUC, PermRolesManage);
  rbac.get('/roles', manage, wrap(handler.listRoles));
  rbac.get('/permissions', manage, wrap(handler.listPermissions));
  rbac.post('/roles', manage, wrap(handler.createRole));
  rbac.put('/roles/:id', manage, wrap(handler.updateRole));
  rbac.put('/roles/:id/permissions', manage, wrap(handler.setRolePermissions));
  rbac.delete('/roles/:id', manage, wrap(handler.deleteRole));

  router.use('/rbac', rbac);
}
