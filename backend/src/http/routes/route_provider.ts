// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newProviderHandler } from '../handlers/v1/provider/provider_handler.js';
import { AuthBodyMaxBytes, bodySizeLimitMiddleware } from '../middlewares/bodysizelimit.js';
import { serviceRLSContext } from '../middlewares/rls.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerProviderRoutes нь /provider/* бүлгийг холбоно — платформыг OIDC
 * provider болгосон login/consent/logout зохицуулалт (frontend-ийн `/oauth/*`
 * хуудсууд дуудна).
 *
 * • get / reject / logout нь CHALLENGE-д тулгуурлана (нэвтрэлт шаардахгүй) —
 *   зөвхөн challenge-ийн эзэмшигч л зөв утга дуудна.
 * • accept endpoint-ууд НЭВТЭРСЭН иргэнийг шаардана (subject = user ID).
 *
 * Challenge-ийн хүснэгтүүд RLS-тэй тул нэвтрээгүй урсгалд "service" identity
 * тавина; usecase давхарга нь өөрөө ч түүнийг тавьдаг (route-ын дараалал
 * өөрчлөгдөхөд эвдрэхгүй).
 */
export function registerProviderRoutes(router: Router, deps: Deps): void {
  const handler = newProviderHandler(deps.providerUC);
  const auth = deps.authMiddleware;
  // Challenge payload-ууд жижиг JSON — 4 KiB-д хязгаарлана.
  const small = bodySizeLimitMiddleware(AuthBodyMaxBytes);
  const svc = serviceRLSContext();

  const provider = Router();

  provider.get('/login', small, svc, wrap(handler.getLogin));
  provider.get('/consent', small, svc, wrap(handler.getConsent));
  provider.post('/login/reject', small, svc, wrap(handler.rejectLogin));
  provider.post('/consent/reject', small, svc, wrap(handler.rejectConsent));
  provider.post('/logout/accept', small, svc, wrap(handler.acceptLogout));

  provider.post('/login/accept', small, auth, wrap(handler.acceptLogin));
  provider.post('/consent/accept', small, auth, wrap(handler.acceptConsent));

  router.use('/provider', provider);
}
