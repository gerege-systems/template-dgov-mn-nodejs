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
 * ⚠️ MIDDLEWARE-ИЙН ХҮРЭЭ: chi-д `r.Group(...)` нь middleware-ийг ЗӨВХӨН тэр
 * бүлэгт тодорхойлсон route-уудад хэрэглэдэг. Express-д ийм зүйл БАЙХГҮЙ —
 * `router.use(subRouter)` нь дэд router-ийн `use()`-г тэр цэгээс хойших БҮХ
 * хүсэлтэд ажиллуулна. Тиймээс бүлэг тус бүрийн middleware-ийг route ТУС БҮРД
 * ил дамжуулна. Эс бөгөөс:
 *   - authMiddleware нь /eid/poll руу "гоожиж" нэвтрэлтийг 401 болгоно;
 *   - чанга (5/мин) limiter нь /eid/poll-д хүрч, long-poll байнга 429 болно.
 */
export function registerAuthRoutes(router: Router, deps: Deps): void {
  const handler = newAuthHandler(deps.authUC, deps.auditUC);

  const auth = Router();

  // Бүх auth route-д хамаарах хамгаалалт:
  // Auth payload-ууд жижиг JSON хэсгүүд — 4 KiB-д хязгаарлах нь хэт том
  // payload-ийн дайралтыг хууль ёсны ямар ч хүсэлтэд нөлөөлөхгүйгээр хаадаг.
  auth.use(bodySizeLimitMiddleware(AuthBodyMaxBytes));
  // RLS: нэвтрэхээс ӨМНӨХ урсгалууд (eID upsert SELECT/INSERT, refresh дэх
  // identity хайлт) баталгаажаагүй хэрэглэгчийн мөрд хандах тул "service"
  // identity тавина. authMiddleware суусан route дээр түүний тогтоосон
  // user/admin identity нь дараа нь ажиллаж үүнийг дарж бичдэг.
  auth.use(serviceRLSContext());

  // ── Чанга rate limiter (IP тус бүрт ~5/мин): нэвтрэлт эхлүүлэх + session
  // lifecycle. Эдгээр нь ховор дуудагддаг тул чанга хязгаар тохирно. ──
  const strict = deps.authRateLimiter.middleware();
  auth.post('/eid/start', strict, wrap(handler.eidStart));
  auth.post('/eid/start-id', strict, wrap(handler.eidStartByNationalId));
  auth.post('/google', strict, wrap(handler.googleLogin));
  auth.post('/refresh', strict, wrap(handler.refresh));
  auth.post('/logout', strict, wrap(handler.logout));

  // ── /eid/poll — СУЛ limiter (~120/мин). Frontend нь session-ийг ~2.5с тутамд
  // long-poll-оор асуудаг тул чанга 5/мин хязгаарт орвол байнга 429 болж
  // амжилттай COMPLETE ХЭЗЭЭ Ч гарахгүй. Сул хязгаар нь хууль ёсны poll-д
  // хангалттай зайтай ч нэг IP-гээс хязгааргүй concurrent 25с long-poll
  // эхлүүлэх slow-DoS-д тааз тавина. authMiddleware ЭНД БАЙХГҮЙ — poll нь
  // нэвтрэхээс ӨМНӨХ урсгал. ──
  auth.post('/eid/poll', deps.pollRateLimiter.middleware(), wrap(handler.eidPoll));

  // ── Нэвтэрсэн хэрэглэгч Google холболтоо САЛГАХ — ЗӨВХӨН энэ route
  // authMiddleware-тэй. ──
  auth.delete('/google/link', deps.authMiddleware, wrap(handler.googleUnlink));

  // ── Нууц үг солих (нэвтэрсэн хэрэглэгч). Go эх хувилбарт handler + usecase
  // бэлэн байсан ч route нь холбогдоогүй үлдсэн — frontend-ийн "Нууц үг солих"
  // маягт үүнийг дуудаж 404 авдаг байсныг ЭНД холбож бүрэн болгов. Чанга
  // limiter: нууц үг таах оролдлогыг IP тус бүрт ~5/мин-д барина. ──
  auth.put('/password/change', deps.authMiddleware, strict, wrap(handler.changePassword));

  router.use('/auth', auth);
}
