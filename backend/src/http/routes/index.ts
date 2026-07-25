// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// routes нь /api/v1-ийн бүх дэд router-ийг нэг дор угсардаг цорын ганц газар юм.
// Домэйн бүр өөрийн route файлтай (route_<domain>.ts) бөгөөд энд бүртгэгдэнэ —
// ингэснээр gate (auth / RBAC / rate-limit) хаана тавигдсаныг нэг файлаас
// шалгаж болно.

import type { Router } from 'express';

import type { RedisCache } from '../../datasources/caches/redis.js';
import type { Db } from '../../datasources/drivers/pg.js';
import type { JWTService } from '../../pkg/jwt/jwt.js';
import type { AuthUsecase } from '../../usecases/auth/auth_usecase.js';
import type { RBACUsecase } from '../../usecases/rbac/rbac_usecase.js';
import type { UsersUsecase } from '../../usecases/users/users_usecase.js';
import type { RateLimiter } from '../middlewares/ratelimit.js';
import type { Middleware } from '../types.js';
import { registerAuthRoutes } from './route_auth.js';
import { registerCoreRoutes } from './route_core.js';
import { registerRBACRoutes } from './route_rbac.js';
import { registerUsersRoutes } from './route_users.js';

/** Deps нь route бүртгэлд шаардлагатай бүх хамаарлын багц. */
export interface Deps {
  db: Db;
  redisCache: RedisCache;
  jwtService: JWTService;
  /** authMiddleware нь Bearer токен шаардах route-уудад суудаг. */
  authMiddleware: Middleware;
  /** usersUC нь хэрэглэгчийн профайл / admin удирдлагын usecase. */
  usersUC: UsersUsecase;
  /** authUC нь eID/Google нэвтрэлт + session-ийн амьдралын мөчлөг. */
  authUC: AuthUsecase;
  /**
   * rbacUC нь динамик role/permission удирдлага. Мөн requirePermission-ийн
   * resolver болдог тул эрх шалгалт нэг эх сурвалжаас гарна.
   */
  rbacUC: RBACUsecase;
  /**
   * eidProxyEnabled нь SSO eID proxy тохируулагдсан эсэх — /users/me хариунд
   * eid_proxy болж, frontend eID хуудсуудыг SSO хэрэглэгчид нээнэ.
   */
  eidProxyEnabled: boolean;
  authRateLimiter: RateLimiter;
  aiRateLimiter: RateLimiter;
  pollRateLimiter: RateLimiter;
  govWriteRateLimiter: RateLimiter;
}

/**
 * registerRoutes нь /api/v1-ийн бүх дэд route-ийг бүртгэнэ. Домэйн шинээр
 * порт хийх бүрд энд нэг мөр нэмнэ.
 */
export function registerRoutes(router: Router, deps: Deps): void {
  registerCoreRoutes(router, deps);
  registerAuthRoutes(router, deps);
  registerRBACRoutes(router, deps);
  registerUsersRoutes(router, deps);
}
