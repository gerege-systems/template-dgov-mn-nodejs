// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermGovReview } from '../../domain/rbac.js';
import { newGovHandler } from '../handlers/v1/gov/gov_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { officerRLSContext } from '../middlewares/rls.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerGovRoutes нь /gov/* бүлгийг холбоно — иргэний портал болон
 * менежерийн дараалал.
 *
 * Мутаци (POST) endpoint-уудад per-IP хязгаар нэмнэ; уншилтын GET-үүд
 * (dashboard-ийн жагсаалтууд) хязгааргүй хэвээр.
 *
 * ⚠️ Менежерийн дараалал ХОЁР давхар хамгаалалттай:
 *   1. `requirePermission(gov.review)` — эрхгүй бол 403.
 *   2. `officerRLSContext` — DB давхаргад 'officer' үүрэг тавьж, ЗӨВХӨН gov
 *      хүснэгтүүдэд хандах эрх өгнө. Эрхийн шалгалт алдаатай байсан ч RLS нь
 *      users/payments/appointments-ыг ХААСАН хэвээр (fail-closed).
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerGovRoutes(router: Router, deps: Deps): void {
  const handler = newGovHandler(deps.govUC);
  const auth = deps.authMiddleware;
  const write = deps.govWriteRateLimiter.middleware();
  // Менежерийн хоёр давхар хаалт (эрх + RLS үүрэг).
  const officer = [auth, requirePermission(deps.rbacUC, PermGovReview), officerRLSContext()];

  const gov = Router();

  // ── Каталог + нүүр ──────────────────────────────────────────────────
  gov.get('/services', auth, wrap(handler.listServices));
  gov.get('/life-events', auth, wrap(handler.listLifeEvents));
  gov.get('/overview', auth, wrap(handler.overview));

  // ── Хүсэлт (иргэн) ──────────────────────────────────────────────────
  gov.get('/applications', auth, wrap(handler.listApplications));
  gov.post('/applications', auth, write, wrap(handler.apply));
  gov.post('/applications/:id/cancel', auth, write, wrap(handler.cancelApplication));
  gov.get('/applications/:id/timeline', auth, wrap(handler.applicationTimeline));
  gov.post('/applications/:id/provide-info', auth, write, wrap(handler.provideInfo));

  // ── Менежерийн дараалал ─────────────────────────────────────────────
  gov.get('/officer/stats', ...officer, wrap(handler.queueStats));
  gov.get('/officer/queue', ...officer, wrap(handler.listQueue));
  gov.get('/officer/queue/:id', ...officer, wrap(handler.queueItem));
  gov.post('/officer/queue/:id/assign', ...officer, write, wrap(handler.assign));
  gov.post('/officer/queue/:id/decide', ...officer, write, wrap(handler.decide));
  gov.post('/officer/queue/:id/complete', ...officer, write, wrap(handler.complete));
  gov.post('/officer/queue/:id/request-info', ...officer, write, wrap(handler.requestInfo));

  // ── Лавлагаа · мэдэгдэл · төлбөр · цаг ──────────────────────────────
  gov.get('/references', auth, wrap(handler.listReferences));
  gov.post('/references', auth, write, wrap(handler.requestReference));

  gov.get('/notifications', auth, wrap(handler.listNotifications));
  gov.post('/notifications/read-all', auth, write, wrap(handler.markAllRead));
  gov.post('/notifications/:id/read', auth, write, wrap(handler.markNotificationRead));

  gov.get('/payments', auth, wrap(handler.listPayments));
  gov.post('/payments/:id/pay', auth, write, wrap(handler.payPayment));

  gov.get('/appointments', auth, wrap(handler.listAppointments));
  gov.post('/appointments', auth, write, wrap(handler.bookAppointment));
  gov.post('/appointments/:id/cancel', auth, write, wrap(handler.cancelAppointment));

  router.use('/gov', gov);
}
