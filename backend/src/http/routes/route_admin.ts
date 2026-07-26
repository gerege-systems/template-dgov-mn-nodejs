// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermUsersManage } from '../../domain/rbac.js';
import { newAdminHandler } from '../handlers/v1/admin/admin_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerAdminRoutes нь /admin/users/* удирдлагын бүлгийг холбоно —
 * `users.manage` эрхээр (admin автоматаар давна).
 *
 * ⚠️ Зэрэглэлийн шалгалт (admin эрхийг ЗӨВХӨН super admin олгоно) нь route-д
 * БИШ, users usecase-д — handler нь дуудагчийн role-ыг дамжуулдаг. Ингэснээр
 * `users.manage` эрхтэй энгийн admin өөрийгөө super admin болгож чадахгүй.
 *
 * `/admin/ai/prompts` нь `settings.manage` эрхтэй бөгөөд route_ai.ts-д
 * бүртгэгддэг (AI домэйнтэйгээ хамт).
 */
export function registerAdminRoutes(router: Router, deps: Deps): void {
  const handler = newAdminHandler(deps.usersUC);
  const auth = deps.authMiddleware;
  const manage = requirePermission(deps.rbacUC, PermUsersManage);

  router.get('/admin/users', auth, manage, wrap(handler.listUsers));
  router.post('/admin/users', auth, manage, wrap(handler.createUser));
  router.put('/admin/users/:id/role', auth, manage, wrap(handler.updateUserRole));
  router.put('/admin/users/:id/active', auth, manage, wrap(handler.setUserActive));
  router.delete('/admin/users/:id', auth, manage, wrap(handler.deleteUser));
}
