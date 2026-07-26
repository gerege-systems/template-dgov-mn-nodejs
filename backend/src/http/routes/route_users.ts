// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newUsersHandler } from '../handlers/v1/users/users_handler.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerUsersRoutes нь /users/* бүлгийг холбоно — хэрэглэгчийн ӨӨРИЙНХ НЬ
 * профайл / өгөгдөлд хамаарах endpoint-ууд. Auth урсгалууд нь route_auth.ts-д.
 *
 * Бүлэг бүхэлдээ authMiddleware-ийн ард — хамгаалалт нь route-ын тодорхойлолтод
 * ил харагдана (handler дотор шалгах нь мартагдах эрсдэлтэй).
 */
export function registerUsersRoutes(router: Router, deps: Deps): void {
  const handler = newUsersHandler(deps.usersUC, deps.eidProxyEnabled);

  const users = Router();
  users.use(deps.authMiddleware);
  users.get('/me', wrap(handler.getUserData));

  router.use('/users', users);
}
