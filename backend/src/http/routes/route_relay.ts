// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermRelayManage, PermRelayView } from '../../domain/rbac.js';
import { newRelayHandler } from '../handlers/v1/relay/relay_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerRelayRoutes нь /relay/* бүлгийг холбоно.
 *
 * • `/relay/webhook` — peer platform-уудын (дээш/доош) m2m цэг. JWT БАЙХГҮЙ:
 *   итгэлийн үндэс нь HMAC-SHA256 гарын үсэг (`X-Relay-Signature`) бөгөөд
 *   ТҮҮХИЙ body дээр шалгагдана. Тиймээс `auth` middleware ЭНД СУУХГҮЙ.
 * • Бусад бүх зам JWT + relay эрх шаардана (relay.view — унших,
 *   relay.manage — бичих). Ingest/respond нь энэ template scaffold-д
 *   relay.manage-аар хамгаалагдана; production-д дээд/доод platform-ууд
 *   эдгээрийг gateway (m2m OAuth)-аар дуудна.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerRelayRoutes(router: Router, deps: Deps): void {
  const handler = newRelayHandler(deps.relayUC);
  const auth = deps.authMiddleware;
  const view = requirePermission(deps.rbacUC, PermRelayView);
  const manage = requirePermission(deps.rbacUC, PermRelayManage);

  const relay = Router();

  // Peer webhook — JWT-гүй, гарын үсгээр баталгаажна.
  relay.post('/webhook', wrap(handler.receiveWebhook));

  // Ingest / respond (m2m урсгал — scaffold-д relay.manage-аар).
  relay.post('/requests', auth, manage, wrap(handler.ingest));
  relay.post('/assignments/:id/respond', auth, manage, wrap(handler.respond));
  relay.post('/requests/:id/forward', auth, manage, wrap(handler.forwardUp));

  // Dashboard.
  relay.get('/overview', auth, view, wrap(handler.overview));
  relay.get('/requests', auth, view, wrap(handler.listRequests));
  relay.get('/requests/:id', auth, view, wrap(handler.getRequest));

  // Platforms / routes (admin config).
  relay.get('/platforms', auth, view, wrap(handler.listPlatforms));
  relay.post('/platforms', auth, manage, wrap(handler.createPlatform));
  relay.delete('/platforms/:id', auth, manage, wrap(handler.deletePlatform));
  relay.get('/routes', auth, view, wrap(handler.listRoutes));
  relay.post('/routes', auth, manage, wrap(handler.createRoute));
  relay.delete('/routes/:id', auth, manage, wrap(handler.deleteRoute));

  router.use('/relay', relay);
}
