// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermUsersManage } from '../../domain/rbac.js';
import { newCoreHandler } from '../handlers/v1/core/core_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerCoreRoutes нь Gerege Core (core.gerege.mn)-ийн хайлтын /core/* бүлгийг
 * холбоно.
 *
 * Энэ нь privileged service token-оор ҮНДЭСНИЙ БҮРТГЭЛЭЭС иргэн/байгууллагыг
 * РД-гээр хайдаг тул зөвхөн `users.manage` эрхтэй ажилтан хандана (admin давна) —
 * эс бөгөөс дурын нэвтэрсэн хэрэглэгч иргэдийн PII-г чөлөөтэй хайх боломжтой
 * болно.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (Express-ийн `use()` нь бүлгээр
 * хязгаарлагддаггүй — route_auth.ts дахь тайлбарыг үз).
 */
export function registerCoreRoutes(router: Router, deps: Deps): void {
  const handler = newCoreHandler(deps.coreUC);
  const manage = requirePermission(deps.rbacUC, PermUsersManage);

  const coreRouter = Router();
  coreRouter.get('/users', deps.authMiddleware, manage, wrap(handler.findUsers));
  coreRouter.get('/organizations', deps.authMiddleware, manage, wrap(handler.findOrganizations));
  router.use('/core', coreRouter);
}
