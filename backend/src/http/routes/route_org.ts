// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newOrgHandler } from '../handlers/v1/org/org_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerOrgRoutes нь /org/* бүлгийг холбоно — байгууллага болон гишүүнчлэлийн
 * бүх endpoint.
 *
 * Бүх endpoint нэвтрэлт шаардана; ЭРХ ОЛГОЛТ (owner/admin эсэх) нь usecase
 * давхаргад хэрэгждэг тул энд нэмэлт gate байхгүй. Middleware-ийг route ТУС
 * БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 *
 * ⚠️ `/lookup/:regNo` нь `/:id`-ээс ӨМНӨ бүртгэгдэнэ — эс бөгөөс Express
 * "lookup" гэсэн мөрийг :id гэж уншина.
 */
export function registerOrgRoutes(router: Router, deps: Deps): void {
  const handler = newOrgHandler(deps.orgUC, deps.auditUC);
  const auth = deps.authMiddleware;

  const org = Router();
  org.post('/', auth, wrap(handler.createOrganization));
  org.get('/', auth, wrap(handler.listMyOrganizations));
  org.get('/lookup/:regNo', auth, wrap(handler.lookupByRegNo));
  org.get('/:id', auth, wrap(handler.getOrganization));
  org.get('/:id/members', auth, wrap(handler.listMembers));
  org.post('/:id/members', auth, wrap(handler.addMember));
  org.put('/:id/members/:userID', auth, wrap(handler.updateMemberRole));
  org.delete('/:id/members/:userID', auth, wrap(handler.removeMember));
  router.use('/org', org);
}
