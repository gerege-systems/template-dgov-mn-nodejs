// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermGatewayManage } from '../../domain/rbac.js';
import { newApplicationsHandler } from '../handlers/v1/applications/applications_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerApplicationsRoutes нь /applications/* бүлгийг холбоно — API Gateway
 * consumer + SSO RP-ийг нэгтгэсэн апп-ын админ гадаргуу.
 *
 * Бүх endpoint `gateway.manage` эрх шаардана: энд OAuth2 client үүсгэж,
 * client_secret эргүүлдэг тул дурын нэвтэрсэн хэрэглэгчид нээлттэй байх ЁСГҮЙ.
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerApplicationsRoutes(router: Router, deps: Deps): void {
  const handler = newApplicationsHandler(deps.applicationsUC);
  const auth = deps.authMiddleware;
  const manage = requirePermission(deps.rbacUC, PermGatewayManage);

  const apps = Router();
  apps.get('/', auth, manage, wrap(handler.list));
  apps.post('/', auth, manage, wrap(handler.create));
  apps.get('/:id', auth, manage, wrap(handler.get));
  apps.put('/:id', auth, manage, wrap(handler.update));
  apps.delete('/:id', auth, manage, wrap(handler.deleteApp));
  apps.post('/:id/rotate-secret', auth, manage, wrap(handler.rotateSecret));
  apps.put('/:id/secret', auth, manage, wrap(handler.setSecret));
  apps.put('/:id/services', auth, manage, wrap(handler.setServices));
  router.use('/applications', apps);
}
