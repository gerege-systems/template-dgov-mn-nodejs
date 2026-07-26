// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermGatewayManage } from '../../domain/rbac.js';
import { newGatewayHandler } from '../handlers/v1/gateway/gateway_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerGatewayRoutes нь /gateway/* бүлгийг холбоно — API Gateway-ийн admin
 * гадаргуу (upstream service-үүд + телеметр).
 *
 * Бүх endpoint `gateway.manage` эрх шаардана: телеметр нь бусад RP-ийн трафикийн
 * мэдээлэл агуулдаг тул дурын нэвтэрсэн хэрэглэгчид нээлттэй байх ЁСГҮЙ.
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerGatewayRoutes(router: Router, deps: Deps): void {
  const handler = newGatewayHandler(deps.gatewayUC);
  const auth = deps.authMiddleware;
  const manage = requirePermission(deps.rbacUC, PermGatewayManage);

  const gateway = Router();
  // Телеметр.
  gateway.get('/overview', auth, manage, wrap(handler.overview));
  gateway.get('/logs', auth, manage, wrap(handler.listLogs));
  // Upstream service-үүд.
  gateway.get('/services', auth, manage, wrap(handler.listServices));
  gateway.post('/services', auth, manage, wrap(handler.createService));
  gateway.put('/services/:id', auth, manage, wrap(handler.updateService));
  gateway.delete('/services/:id', auth, manage, wrap(handler.deleteService));
  router.use('/gateway', gateway);
}
