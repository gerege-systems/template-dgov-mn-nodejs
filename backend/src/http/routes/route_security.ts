// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newSecurityHandler } from '../handlers/v1/security/security_handler.js';
import { requireAdmin } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerSecurityRoutes нь /security/* бүлгийг холбоно.
 *
 * `POST /events` нь нэвтэрсэн хэрэглэгч БҮРТ нээлттэй (RASP клиент нь дурын
 * хэрэглэгчийн төхөөрөмжөөс мэдээлдэг) — RLS бодлого нь тэр мөрийн user_id
 * тухайн хэрэглэгчийнх байхыг баталгаажуулна. `GET /events` нь ЗӨВХӨН admin.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (Express-ийн `use()` нь бүлгээр
 * хязгаарлагддаггүй — route_auth.ts дахь тайлбарыг үз).
 */
export function registerSecurityRoutes(router: Router, deps: Deps): void {
  const handler = newSecurityHandler(deps.securityUC);

  const securityRouter = Router();
  securityRouter.post('/events', deps.authMiddleware, wrap(handler.ingest));
  securityRouter.get('/events', deps.authMiddleware, requireAdmin(), wrap(handler.list));
  router.use('/security', securityRouter);
}
