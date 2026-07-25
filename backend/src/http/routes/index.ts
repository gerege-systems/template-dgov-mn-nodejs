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
import type { RateLimiter } from '../middlewares/ratelimit.js';
import type { Middleware } from '../types.js';
import { registerCoreRoutes } from './route_core.js';

/** Deps нь route бүртгэлд шаардлагатай бүх хамаарлын багц. */
export interface Deps {
  db: Db;
  redisCache: RedisCache;
  jwtService: JWTService;
  /** authMiddleware нь Bearer токен шаардах route-уудад суудаг. */
  authMiddleware: Middleware;
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
}
