// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermSettingsManage } from '../../domain/rbac.js';
import { newAIHandler } from '../handlers/v1/ai/ai_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerAIRoutes нь /ai/* (иргэн) болон /admin/ai/* (админ) бүлгүүдийг
 * холбоно.
 *
 * Gemini дуудлага үнэтэй тул /ai/* нь нэвтэрсэн хэрэглэгч шаардахаас гадна
 * тусдаа (auth-аас сулавтар — ~20/мин) rate limiter авдаг: live орчуулга нь
 * минутад ~8 audio chunk урсгадаг тул 5/мин хязгаарт багтахгүй.
 *
 * Audio (base64 ~700 KB) + текст payload нь глобал 1 MiB хязгаарт багтана —
 * энд тусдаа чангалалт хэрэггүй (глобал давхарга барина).
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerAIRoutes(router: Router, deps: Deps): void {
  const handler = newAIHandler(deps.aiUC);
  const auth = deps.authMiddleware;
  const limit = deps.aiRateLimiter.middleware();

  const ai = Router();
  ai.post('/chat', auth, limit, wrap(handler.chat));
  ai.post('/stt', auth, limit, wrap(handler.transcribe));
  ai.post('/tts', auth, limit, wrap(handler.speak));
  ai.post('/translate', auth, limit, wrap(handler.translate));
  router.use('/ai', ai);

  // ── Админ: prompt давхаргууд (settings.manage) ───────────────────────
  // Suurь (base) дүрэм кодод хатуу бичигдсэн тул ЭНД ХАРАГДАХГҮЙ,
  // өөрчлөгдөхгүй — зөвхөн scope/instructions давхарга тохируулагдана.
  const manage = requirePermission(deps.rbacUC, PermSettingsManage);
  router.get('/admin/ai/prompts', auth, manage, wrap(handler.listPrompts));
  router.put('/admin/ai/prompts/:key', auth, manage, wrap(handler.setPrompt));
}
