// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Server } from 'node:http';

import express, { type Express } from 'express';

import { AppConfig } from '../../../config/config.js';
import {
  EndpointV1,
  EnvironmentProduction,
  LoggerCategory,
  LoggerCategoryServer,
} from '../../../constants/index.js';
import { newRedisCache, type RedisCache } from '../../../datasources/caches/redis.js';
import { setupPostgres, type Db } from '../../../datasources/drivers/pg.js';
import { newHealthHandler } from '../../../http/handlers/v1/health.js';
import { accessLogMiddleware } from '../../../http/middlewares/access_log.js';
import { newAuthMiddleware } from '../../../http/middlewares/auth.js';
import {
  bodySizeLimitMiddleware,
  UploadBodyMaxBytes,
} from '../../../http/middlewares/bodysizelimit.js';
import { clientIPMiddleware } from '../../../http/middlewares/clientip.js';
import { corsMiddleware } from '../../../http/middlewares/cors.js';
import {
  metricsMiddleware,
  registerDbPoolMetrics,
  registry as metricsRegistry,
} from '../../../http/middlewares/metrics.js';
import { observabilityGate } from '../../../http/middlewares/observability_gate.js';
import { newRateLimiter, type RateLimiter } from '../../../http/middlewares/ratelimit.js';
import { recovererMiddleware } from '../../../http/middlewares/recoverer.js';
import { requestIDMiddleware } from '../../../http/middlewares/requestid.js';
import { securityHeadersMiddleware } from '../../../http/middlewares/security.js';
import { DefaultRequestTimeoutMs, timeoutMiddleware } from '../../../http/middlewares/timeout.js';
import { registerRoutes, type Deps } from '../../../http/routes/index.js';
import { newJWTServiceWithRefresh } from '../../../pkg/jwt/jwt.js';
import * as logger from '../../../pkg/logger/logger.js';
import { setupTracing, type Shutdown } from '../../../pkg/observability/tracing.js';
import { openapiDocument } from '../../openapi/document.js';

const serviceName = 'gerege-template-node';

/** App нь ажиллаж буй үйлчилгээ болон түүний унтраах ёстой нөөцүүдийг агуулна. */
export class App {
  private server: Server | null = null;

  constructor(
    readonly app: Express,
    private readonly db: Db,
    private readonly redisCache: RedisCache,
    private readonly tracerShutdown: Shutdown,
    private readonly rateLimiters: RateLimiter[],
  ) {}

  /** listen нь HTTP серверийг тохируулсан порт дээр эхлүүлнэ. */
  async listen(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = this.app.listen(AppConfig.PORT, () => {
        logger.info(`server listening on :${AppConfig.PORT}`, {
          [LoggerCategory]: LoggerCategoryServer,
          environment: AppConfig.ENVIRONMENT,
        });
        resolve();
      });
      // Keep-alive нь урвуу proxy-гийн idle timeout-аас УРТ байх ёстой — эс
      // бөгөөс nginx дахин ашиглах гэж буй холболтыг Node тасалж, 502 гарна.
      this.server.keepAliveTimeout = 65_000;
      this.server.headersTimeout = 66_000;
    });
  }

  /**
   * shutdown нь шинэ холболт хүлээж авахаа болиод, идэвхтэй хүсэлтүүдийг
   * дуустал хүлээж, дараа нь бүх нөөцийг чөлөөлнө.
   */
  async shutdown(): Promise<void> {
    logger.info('shutting down…', { [LoggerCategory]: LoggerCategoryServer });
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
        // Идэвхтэй хүсэлт 15 секундээс удвал хүчээр таслана.
        setTimeout(() => resolve(), 15_000).unref();
      });
    }
    for (const rl of this.rateLimiters) rl.stop();
    await this.redisCache.close().catch(() => undefined);
    await this.db.close().catch(() => undefined);
    await this.tracerShutdown().catch(() => undefined);
    logger.info('shutdown complete', { [LoggerCategory]: LoggerCategoryServer });
  }
}

/**
 * newApp нь бүх хамаарлыг ГАРААР угсарна (manual DI) — framework-ийн шидэт
 * container байхгүй тул юу юунаас хамаарахыг энэ нэг файлаас уншиж болно.
 */
export async function newApp(): Promise<App> {
  // Tracer-ийг эхэлд тохируулна — ингэснээр дараагийн тохиргооноос ялгарах
  // span-ууд зөв provider руу очно.
  const tracerShutdown = await setupTracing({
    serviceName,
    environment: AppConfig.ENVIRONMENT,
    exporter: AppConfig.OTEL_EXPORTER,
    sampleRatio: AppConfig.OTEL_SAMPLE_RATIO,
  });

  // өгөгдлийн сан (pg pool)
  const db = await setupPostgres();
  // pool-ийн бодит статистикийг /metrics-ээр гаргана.
  registerDbPoolMetrics(() => ({
    total: db.pool.totalCount,
    idle: db.pool.idleCount,
    waiting: db.pool.waitingCount,
  }));

  // jwt сервис
  const jwtService = newJWTServiceWithRefresh(
    AppConfig.JWT_SECRET,
    AppConfig.JWT_ISSUER,
    AppConfig.JWT_EXPIRED,
    AppConfig.JWT_REFRESH_EXPIRED,
  );

  // кэш
  const redisCache = newRedisCache(
    AppConfig.REDIS_HOST,
    0,
    AppConfig.REDIS_PASS,
    AppConfig.REDIS_EXPIRED,
  );

  const app = express();
  // Proxy-гийн X-Forwarded-* header-т Express-ийн өөрийн итгэлийг УНТРААНА —
  // бид клиент IP-г clientIP() дотор TRUSTED_PROXIES-ээр өөрсдөө шийддэг.
  app.set('trust proxy', false);
  app.disable('x-powered-by');
  app.set('etag', false);

  // Глобал middleware. Дараалал чухал: эхэлд request-id — ингэснээр panic
  // recovery хариунд ч корреляцийн ID орно.
  app.use(requestIDMiddleware());
  app.use(clientIPMiddleware());
  app.use(metricsMiddleware());
  app.use(securityHeadersMiddleware());
  app.use(corsMiddleware());
  // Глобал net нь upload-ийн дээд хязгаар (26 MiB) — файл байршуулдаг sign
  // route-ууд үүнийг шаарддаг. Ердийн JSON route-уудыг express.json-ий 1 MiB
  // cap + auth-ийн 4 KiB route-cap хамгаална.
  app.use(bodySizeLimitMiddleware(UploadBodyMaxBytes));
  app.use(accessLogMiddleware());
  app.use(timeoutMiddleware(DefaultRequestTimeoutMs));

  // Дэд бүтцийн endpoint-ууд (/api бүлгээс гадуур). /health, /ready нь load
  // balancer / orchestrator-т хэрэгтэй тул нээлттэй хэвээр; харин /metrics,
  // /swagger нь операторын мэдрэмжтэй endpoint тул production-д
  // observabilityGate-аар (bearer token + 404) хаагдана.
  const healthHandler = newHealthHandler(db, redisCache.client());
  app.get('/health', healthHandler.health);
  app.get('/ready', healthHandler.ready);

  const isProduction = AppConfig.ENVIRONMENT === EnvironmentProduction;
  const obsGate = observabilityGate(isProduction, AppConfig.OBSERVABILITY_TOKEN);
  app.get('/metrics', obsGate, (_req, res) => {
    void (async () => {
      res.type(metricsRegistry.contentType).send(await metricsRegistry.metrics());
    })();
  });
  app.get('/swagger/doc.json', obsGate, (_req, res) => {
    res.type('application/json').send(JSON.stringify(openapiDocument()));
  });

  // Rate limiter-ууд. Тоонууд нь Go хувилбартай ижил: auth ~5 req/min,
  // ai ~20 req/min (live орчуулга минутад ~8 chunk урсгадаг), poll болон
  // gov бичилтийн тусдаа bucket-ууд.
  const authRateLimiter = newRateLimiter(5 / 60, 5);
  const aiRateLimiter = newRateLimiter(20 / 60, 20);
  const pollRateLimiter = newRateLimiter(120 / 60, 120);
  const govWriteRateLimiter = newRateLimiter(30 / 60, 30);

  const authMiddleware = newAuthMiddleware(jwtService, redisCache, false);

  const deps: Deps = {
    db,
    redisCache,
    jwtService,
    authMiddleware,
    authRateLimiter,
    aiRateLimiter,
    pollRateLimiter,
    govWriteRateLimiter,
  };

  const v1 = express.Router();
  registerRoutes(v1, deps);
  app.use(EndpointV1, v1);

  // Танигдаагүй зам — нэгдсэн дугтуйтай 404.
  app.use((req, res) => {
    res
      .status(404)
      .type('application/json; charset=utf-8')
      .send(
        JSON.stringify({
          status: false,
          message: 'route not found',
          ...(req.ctx?.requestId ? { request_id: req.ctx.requestId } : {}),
        }),
      );
  });

  // Алдаа боогч нь ХАМГИЙН СҮҮЛД — доод урсгалын бүх алдааг барина.
  app.use(recovererMiddleware());

  return new App(app, db, redisCache, tracerShutdown, [
    authRateLimiter,
    aiRateLimiter,
    pollRateLimiter,
    govWriteRateLimiter,
  ]);
}
