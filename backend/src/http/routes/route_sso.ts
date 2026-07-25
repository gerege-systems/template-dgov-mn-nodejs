// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newSSOHandler } from '../handlers/v1/sso/sso_handler.js';
import { AuthBodyMaxBytes, bodySizeLimitMiddleware } from '../middlewares/bodysizelimit.js';
import { serviceRLSContext } from '../middlewares/rls.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerSSORoutes нь /sso/* бүлгийг холбоно — гадаад SSO (OIDC)-ээр нэвтрэх.
 *
 * Бүгд НЭВТРЭХЭЭС ӨМНӨХ урсгал тул `serviceRLSContext` (RLS "service" үүрэг)
 * шаардлагатай — иргэн хараахан танигдаагүй ч users хүснэгтэд upsert хийнэ.
 * Body-г auth-ийн адил ЧАНГА (4 KiB) хязгаарлана.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerSSORoutes(router: Router, deps: Deps): void {
  const handler = newSSOHandler(deps.ssoUC);
  const limit = bodySizeLimitMiddleware(AuthBodyMaxBytes);
  const svc = serviceRLSContext();
  // Нэвтрэлтийн урсгал тул auth-ийн адил чанга per-IP хязгаартай.
  const rate = deps.authRateLimiter.middleware();

  const sso = Router();
  sso.post('/start', limit, svc, rate, wrap(handler.start));
  sso.post('/callback', limit, svc, rate, wrap(handler.callback));
  sso.post('/native', limit, svc, rate, wrap(handler.ssoNative));
  sso.post('/logout', limit, svc, wrap(handler.logout));
  router.use('/sso', sso);
}
