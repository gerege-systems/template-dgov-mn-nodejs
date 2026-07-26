// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newGSpaceHandler } from '../handlers/v1/gspace/gspace_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerGSpaceRoutes нь /gspace/* бүлгийг холбоно — хэрэглэгчийн өөрийн
 * файлын хадгалалт (SFTP).
 *
 * Мутаци (upload/delete) нь per-IP бичилтийн хязгаартай; уншилт (overview/
 * download) хязгааргүй. Хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гарна.
 *
 * ⚠️ `/upload`-ийн JSON body нь глобал 1 MiB-аас ТОМ байж болно (файл base64-ээр
 * дамждаг) тул server.ts-д тэр замд ТУСДАА, илүү өндөр хязгаартай JSON parser
 * глобал parser-аас ӨМНӨ суудаг — эс бөгөөс 2 MB квоттой файл ~750 KB дээр
 * тасарна.
 */
export function registerGSpaceRoutes(router: Router, deps: Deps): void {
  const handler = newGSpaceHandler(deps.gspaceUC);
  const auth = deps.authMiddleware;
  const write = deps.govWriteRateLimiter.middleware();

  const gspace = Router();
  gspace.get('/', auth, wrap(handler.overview));
  gspace.get('/download', auth, wrap(handler.download));
  gspace.post('/upload', auth, write, wrap(handler.upload));
  gspace.delete('/', auth, write, wrap(handler.deleteFile));
  router.use('/gspace', gspace);
}
