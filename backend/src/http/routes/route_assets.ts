// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newAssetsHandler } from '../handlers/v1/assets/assets_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerAssetsRoutes нь гарын үсэг (хувь хүн) · байгууллагын тамга · латин
 * нэрийн /me/* бүлгийг холбоно.
 *
 * ЯАГААД `/me` вэ (`/users/me` БИШ): `/users/me` дор mount хийвэл одоо байгаа
 * `GET /users/me` (who-am-I) endpoint-той зөрчилдөнө. Тиймээс зөрчилгүй `/me`
 * namespace-д нэрлэсэн leaf-үүдтэйгээр байрлуулав — Go хувилбартай ижил.
 *
 * Мутацийн (PUT/DELETE) endpoint-уудад per-IP бичилтийн хязгаар нэмнэ;
 * уншилтын GET-үүд хязгааргүй хэвээр. Middleware-ийг route ТУС БҮРД ил
 * дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerAssetsRoutes(router: Router, deps: Deps): void {
  const handler = newAssetsHandler(deps.assetsUC);
  const auth = deps.authMiddleware;
  const write = deps.govWriteRateLimiter.middleware();

  const me = Router();

  // Хувь хүний гарын үсэг.
  me.get('/signature', auth, wrap(handler.getSignature));
  me.put('/signature', auth, write, wrap(handler.setSignature));
  me.delete('/signature', auth, write, wrap(handler.deleteSignature));

  // Латин нэр засах (галиглалт заримдаа буруу).
  me.put('/latin-name', auth, write, wrap(handler.setLatinName));
  me.put('/org-name-latin/:regNo', auth, write, wrap(handler.setOrgNameLatin));

  // Байгууллагын тамганы дардас (унших — төлөөлөгч; бичих — зөвхөн ADMIN).
  me.get('/orgstamp/:regNo', auth, wrap(handler.getStamp));
  me.put('/orgstamp/:regNo', auth, write, wrap(handler.setStamp));
  me.delete('/orgstamp/:regNo', auth, write, wrap(handler.deleteStamp));

  router.use('/me', me);
}
