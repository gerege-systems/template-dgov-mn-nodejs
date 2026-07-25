// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newAuthHandler } from '../handlers/v1/auth/auth_handler.js';
import { AuthBodyMaxBytes, bodySizeLimitMiddleware } from '../middlewares/bodysizelimit.js';
import { serviceRLSContext } from '../middlewares/rls.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerAuthRoutes нь /auth/* бүлгийг холбоно.
 *
 * "Login with eID" нь ЦОРЫН ГАНЦ нэвтрэх арга тул нууц үг/OTP/бүртгэлийн
 * route-ууд БАЙХГҮЙ; зөвхөн eID нэвтрэлт (/eid/start, /eid/start-id, /eid/poll),
 * Google холболт (/google, /google/link) болон session-ийн амьдралын мөчлөг
 * (/refresh, /logout).
 *
 * Бүлэг нь гурван дэд бүлэгт хуваагдана:
 *   1. rate-limit-тэй  — нэвтрэлт эхлүүлэх + session lifecycle (чанга, ~5/мин)
 *   2. authMiddleware-тэй — нэвтэрсэн хэрэглэгчийн Google салгах
 *   3. poll-ийн СУЛ limiter — long-poll-ийг 429-дэхгүй (~120/мин)
 *
 * Бүх дэд бүлэг body хязгаар (4 KiB) + serviceRLSContext авна.
 */
export function registerAuthRoutes(router: Router, deps: Deps): void {
  const handler = newAuthHandler(deps.authUC);

  const auth = Router();

  // Auth payload-ууд жижиг JSON хэсгүүд — 4 KiB-д хязгаарлах нь хэт том
  // payload-ийн дайралтыг хууль ёсны ямар ч хүсэлтэд нөлөөлөхгүйгээр хаадаг.
  auth.use(bodySizeLimitMiddleware(AuthBodyMaxBytes));
  // RLS: нэвтрэхээс ӨМНӨХ урсгалууд (eID upsert SELECT/INSERT, refresh дэх
  // identity хайлт) баталгаажаагүй хэрэглэгчийн мөрд хандах тул "service"
  // identity тавина. authMiddleware суусан route дээр түүний тогтоосон
  // user/admin identity нь дараа нь ажиллаж үүнийг дарж бичдэг.
  auth.use(serviceRLSContext());

  // ── 1. Rate limiter-тэй: нэвтрэлт эхлүүлэх + session lifecycle ──
  // Эдгээр нь ховор дуудагддаг тул чанга хязгаар (IP тус бүрт ~5/мин) тохирно.
  const limited = Router();
  limited.use(deps.authRateLimiter.middleware());
  limited.post('/eid/start', wrap(handler.eidStart));
  limited.post('/eid/start-id', wrap(handler.eidStartByNationalId));
  limited.post('/google', wrap(handler.googleLogin));
  limited.post('/refresh', wrap(handler.refresh));
  limited.post('/logout', wrap(handler.logout));
  auth.use(limited);

  // ── 2. Нэвтэрсэн хэрэглэгч Google холболтоо САЛГАХ ──
  const authed = Router();
  authed.use(deps.authMiddleware);
  authed.delete('/google/link', wrap(handler.googleUnlink));
  auth.use(authed);

  // ── 3. /eid/poll — СУЛ limiter ──
  // Frontend нь session-ийг ~2.5с тутамд long-poll-оор асуудаг тул /auth-ийн
  // чанга 5/мин хязгаарт орвол байнга 429 болж амжилттай COMPLETE ХЭЗЭЭ Ч
  // гарахгүй. Иймд тусдаа сул limiter: хууль ёсны poll-д хангалттай зайтай ч нэг
  // IP-гээс хязгааргүй concurrent 25с long-poll эхлүүлэх slow-DoS-д тааз тавина.
  const polling = Router();
  polling.use(deps.pollRateLimiter.middleware());
  polling.post('/eid/poll', wrap(handler.eidPoll));
  auth.use(polling);

  router.use('/auth', auth);
}
