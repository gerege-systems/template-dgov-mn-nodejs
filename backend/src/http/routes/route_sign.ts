// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newSignHandler } from '../handlers/v1/sign/sign_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerSignRoutes нь /sign/* бүлгийг холбоно — PDF гарын үсэг (PAdES)
 * eidmongolia /v3-ээр. Бүгд нэвтэрсэн иргэн шаардана.
 *
 * ⚠️ `/sign/init` нь multipart (PDF) хүлээж авдаг тул глобал JSON parser-ээс
 * ГАДУУР ажиллана — handler нь түүхий урсгалыг busboy-оор уншина. Глобал
 * bodySizeLimit (26 MiB) нь дээд таазыг барина.
 */
export function registerSignRoutes(router: Router, deps: Deps): void {
  const handler = newSignHandler(deps.signUC, deps.usersUC, deps.assetsUC);
  const auth = deps.authMiddleware;

  const sign = Router();
  sign.post('/init', auth, wrap(handler.init));
  sign.get('/:id', auth, wrap(handler.poll));
  sign.get('/:id/download', auth, wrap(handler.download));
  router.use('/sign', sign);
}
