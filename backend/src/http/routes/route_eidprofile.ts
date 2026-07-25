// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newEidProfileHandler } from '../handlers/v1/eidprofile/eidprofile_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerEidProfileRoutes нь нэвтэрсэн иргэний eID нэмэлт мэдээллийн
 * `/users/me/eid/*` бүлгийг холбоно.
 *
 * Мутаци (байгууллага холбох/салгах, зурагч нэмэх/хасах) нь per-IP бичилтийн
 * хязгаартай; уншилтын GET-үүд хязгааргүй.
 *
 * ⚠️ Энэ бүлэг нь `GET /users/me` (who-am-I)-тай ижил угтвартай тул Express-ийн
 * router-ийг `/users/me/eid` дэд зам дор mount хийв — `route_users.ts` дахь
 * `/users/me` нь ТУСДАА router бөгөөд ЭХЛЭЭД бүртгэгддэг тул шадовлагдахгүй.
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerEidProfileRoutes(router: Router, deps: Deps): void {
  const handler = newEidProfileHandler(deps.authUC);
  const auth = deps.authMiddleware;
  const write = deps.govWriteRateLimiter.middleware();

  const eid = Router();

  // Төлөөлдөг байгууллагууд.
  eid.get('/organizations', auth, wrap(handler.organizations));
  eid.post('/organizations', auth, write, wrap(handler.addOrganization));
  eid.delete('/organizations/:regNo', auth, write, wrap(handler.removeOrganization));

  // Байгууллагын гарын үсэг зурагчид (нэвтэрсэн иргэн төлөөлөгч байх ёстой).
  eid.get('/organizations/:regNo/signers', auth, wrap(handler.orgSigners));
  eid.post('/organizations/:regNo/signers', auth, write, wrap(handler.addOrgSigner));
  eid.post('/organizations/:regNo/signers/resend', auth, write, wrap(handler.resendOrgSigner));
  eid.delete('/organizations/:regNo/signers', auth, write, wrap(handler.removeOrgSigner));

  // Иргэний PKI самбар (RP-д PKI_READ эрх шаардана — эсвэл SSO proxy).
  eid.get('/summary', auth, wrap(handler.summary));
  eid.get('/certificates', auth, wrap(handler.certificates));
  eid.get('/devices', auth, wrap(handler.devices));
  eid.get('/activity', auth, wrap(handler.activity));

  router.use('/users/me/eid', eid);
}
