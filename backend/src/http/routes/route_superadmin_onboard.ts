// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newSuperadminOnboardHandler } from '../handlers/v1/superadminonboard/superadminonboard_handler.js';
import { AuthBodyMaxBytes, bodySizeLimitMiddleware } from '../middlewares/bodysizelimit.js';
import { serviceRLSContext } from '../middlewares/rls.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerSuperadminOnboardRoutes нь /auth/superadmin/* бүлгийг холбоно:
 * урилгаар хаалттай super admin бүртгэлийн шидтэн (Google → eID → и-мэйл OTP →
 * TOTP) болон MFA-тай нэвтрэлтийн 2 дахь шат.
 *
 * Бүх route НЭВТРЭЭГҮЙ (нэвтрэхээс өмнөх гадаргуу) тул authMiddleware
 * АВАХГҮЙ — оронд нь:
 *   • authRateLimiter (~5/мин) — brute-force / нэвтрэлтийн оролдлого;
 *   • AuthBodyMaxBytes (4 KiB) — auth-ийн жижиг JSON payload;
 *   • serviceRLSContext — нэвтрээгүй хэрэглэгчийн мөрд хандах (урилга хайх,
 *     хэрэглэгч upsert, нөөц код) шаардлагатай "service" RLS identity.
 *
 * Бодит хаалт нь: урилгын allow-list (Google алхам), onboard_token (бусад
 * алхам) болон mfa_token + TOTP/нөөц код (/mfa) дээр тогтоно.
 *
 * ⚠️ `/onboard/eid/poll` нь ~2.5с тутам long-poll хийгддэг тул чанга 5/мин
 * хязгаарт орвол COMPLETE ХЭЗЭЭ Ч гарахгүй — /auth/eid/poll-ийн адил тусдаа
 * СУЛ limiter авна.
 */
export function registerSuperadminOnboardRoutes(router: Router, deps: Deps): void {
  const handler = newSuperadminOnboardHandler(deps.onboardingUC);
  const small = bodySizeLimitMiddleware(AuthBodyMaxBytes);
  const svc = serviceRLSContext();
  const strict = deps.authRateLimiter.middleware();
  const poll = deps.pollRateLimiter.middleware();

  const sa = Router();
  // Нэвтрэлтийн 2 дахь шат (давтагдах нэвтрэлт).
  sa.post('/mfa', small, svc, strict, wrap(handler.mfa));

  // Бүртгэлийн шидтэн.
  sa.post('/onboard/google', small, svc, strict, wrap(handler.google));
  sa.post('/onboard/eid/start', small, svc, strict, wrap(handler.eidStart));
  sa.post('/onboard/eid/start-id', small, svc, strict, wrap(handler.eidStartByNationalId));
  sa.post('/onboard/eid/poll', small, svc, poll, wrap(handler.eidPoll));
  sa.post('/onboard/email/send', small, svc, strict, wrap(handler.emailSend));
  sa.post('/onboard/email/verify', small, svc, strict, wrap(handler.emailVerify));
  sa.post('/onboard/totp/init', small, svc, strict, wrap(handler.totpInit));
  sa.post('/onboard/totp/verify', small, svc, strict, wrap(handler.totpVerify));

  router.use('/auth/superadmin', sa);
}
