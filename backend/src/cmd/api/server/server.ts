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
import { newMemoryCache } from '../../../datasources/caches/memory.js';
import { newRedisCache, type RedisCache } from '../../../datasources/caches/redis.js';
import { newAuditRepository } from '../../../datasources/repositories/postgres/audit/audit_postgres.js';
import { newGatewayRepository } from '../../../datasources/repositories/postgres/gateway/gateway_postgres.js';
import { newOAuthClientRepository } from '../../../datasources/repositories/postgres/oauth/oauth_clients_postgres.js';
import { newServiceScopeResolver } from '../../../datasources/repositories/postgres/oauth/service_scope_postgres.js';
import { newOrgRepository } from '../../../datasources/repositories/postgres/org/org_postgres.js';
import { newPlatformSettingsRepository } from '../../../datasources/repositories/postgres/platformsettings/platformsettings_postgres.js';
import { newRegistryRepository } from '../../../datasources/repositories/postgres/registry/registry_postgres.js';
import { newSSOTokenRepository } from '../../../datasources/repositories/postgres/ssotoken/ssotoken_postgres.js';
import { newSSOUserRepository } from '../../../datasources/repositories/postgres/ssouser/ssouser_postgres.js';
import { newUserIntegrationsRepository } from '../../../datasources/repositories/postgres/userintegrations/userintegrations_postgres.js';
import { newOrgStampRepository } from '../../../datasources/repositories/postgres/orgstamp/orgstamp_postgres.js';
import { newRBACRepository } from '../../../datasources/repositories/postgres/rbac/rbac_postgres.js';
import { newSecurityEventRepository } from '../../../datasources/repositories/postgres/security/security_postgres.js';
import {
  newSiteRepository,
  newThemeRepository,
} from '../../../datasources/repositories/postgres/site/site_postgres.js';
import { newUserRepository } from '../../../datasources/repositories/postgres/users/users_postgres.js';
import { setupPostgres, type Db } from '../../../datasources/drivers/pg.js';
import { newHealthHandler } from '../../../http/handlers/v1/health.js';
import { accessLogMiddleware } from '../../../http/middlewares/access_log.js';
import { newAuthMiddleware } from '../../../http/middlewares/auth.js';
import {
  bodySizeLimitMiddleware,
  DefaultBodyMaxBytes,
  GSpaceUploadBodyMaxBytes,
  UploadBodyMaxBytes,
} from '../../../http/middlewares/bodysizelimit.js';
import { clientIPMiddleware } from '../../../http/middlewares/clientip.js';
import { gatewayRequestLogMiddleware } from '../../../http/middlewares/gateway_log.js';
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
import { newEidClient } from '../../../pkg/eid/eid.js';
import { newGoogleClient } from '../../../pkg/google/google.js';
import { newGSpaceClient } from '../../../pkg/gspace/gspace.js';
import { newJWTServiceWithRefresh } from '../../../pkg/jwt/jwt.js';
import { newCipher } from '../../../pkg/crypto/cipher.js';
import { newOIDCClient } from '../../../pkg/oidc/oidc.js';
import { newSSOEidProxy } from '../../../pkg/ssoeidproxy/ssoeidproxy.js';
import { newXypClient } from '../../../pkg/xyp/xyp.js';
import { newAuditUsecase } from '../../../usecases/audit/audit_usecase.js';
import { newAuthUsecase } from '../../../usecases/auth/auth_impl.js';
import { newApplicationsUsecase } from '../../../usecases/applications/applications_usecase.js';
import { newAssetsUsecase } from '../../../usecases/assets/assets_usecase.js';
import { newCoreUsecase } from '../../../usecases/core/core_impl.js';
import { newGatewayUsecase } from '../../../usecases/gateway/gateway_usecase.js';
import { newGSpaceUsecase } from '../../../usecases/gspace/gspace_usecase.js';
import { newRegistryUsecase } from '../../../usecases/registry/registry_usecase.js';
import { newSSOTokenUsecase } from '../../../usecases/ssotoken/ssotoken_usecase.js';
import { newSSOUsecase } from '../../../usecases/sso/sso_usecase.js';
import { newIntegrationsUsecase } from '../../../usecases/integrations/integrations_usecase.js';
import { newOrgUsecase } from '../../../usecases/org/org_usecase.js';
import { newRBACUsecase } from '../../../usecases/rbac/rbac_impl.js';
import { newSecurityUsecase } from '../../../usecases/security/security_usecase.js';
import { newSiteUsecase, newThemeUsecase } from '../../../usecases/site/site_usecase.js';
import { newUsersUsecase } from '../../../usecases/users/users_impl.js';
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

  // API Gateway — upstream service-ийн бүртгэл + бодит хүсэлтийн телеметр.
  // Глобал middleware нь үүнийг ашигладаг тул app үүсгэхээс ӨМНӨ бэлдэнэ.
  const gatewayUC = newGatewayUsecase(newGatewayRepository(db));

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
  // JSON body parser — Go-ийн DecodeBody-тай ижил 1 MiB гүний cap. Route-түвшний
  // чанга хязгаарууд (auth = 4 KiB) bodySizeLimitMiddleware-ээр давхар барина.
  // `strict` нь top-level объект/массивыг Л хүлээн авна.
  // ⚠️ Дараалал чухал: /gspace/upload нь файлыг base64-ээр JSON-д зөөдөг тул
  // ердийн 1 MiB-д багтахгүй. express.json нь аль хэдийн задлагдсан body-г
  // алгасдаг учир энэ ТУСГАЙ parser нь глобалаас ӨМНӨ сууж, зөвхөн тэр замд
  // өндөр хязгаар өгнө (глобал hard ceiling нь дээр хэвээр).
  app.use(
    `${EndpointV1}/gspace/upload`,
    express.json({ limit: GSpaceUploadBodyMaxBytes, strict: true }),
  );
  app.use(express.json({ limit: DefaultBodyMaxBytes, strict: true }));
  app.use(accessLogMiddleware());
  // API Gateway-ийн телеметр — ЗӨВХӨН гуравдагч талын RP-ийн зам (/rp/sign,
  // /api/v1/provider) бичигдэнэ. Хариу бүрэн илгээгдсэний дараа бичдэг тул
  // хэрэглэгчийн хүлээх хугацаанд нөлөөлөхгүй.
  app.use(
    gatewayRequestLogMiddleware((ctx, input) => {
      gatewayUC.recordRequest(ctx, input);
    }),
  );
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

  // ── Хязгаарлагдсан контекстуудыг угсарна (manual DI: repo → usecase → route) ──
  // Процессийн дотоод кэш — уншилтын халуун замд (хэрэглэгчийг email-ээр хайх)
  // зориулагдсан. Токен хүчингүй болгох шийдвэр ХЭЗЭЭ Ч энд биш, Redis-д байна.
  const memoryCache = newMemoryCache();

  const userRepo = newUserRepository(db);
  const usersUC = newUsersUsecase(userRepo, memoryCache, {
    bcryptCost: AppConfig.BCRYPT_COST,
  });

  // eID Mongolia RP client — "Login with eID" нь цорын ганц интерактив нэвтрэх арга.
  const eidClient = newEidClient(
    AppConfig.EID_BASE_URL,
    AppConfig.EID_RP_UUID,
    AppConfig.EID_RP_NAME,
    AppConfig.EID_RP_SECRET,
    AppConfig.EID_CERT_LEVEL,
  );
  // Google OAuth — креденшл тохируулаагүй бол feature fail-closed (configured()=false).
  const googleClient = newGoogleClient(AppConfig.GOOGLE_CLIENT_ID, AppConfig.GOOGLE_CLIENT_SECRET);
  // XYP — улсын бүртгэлийн байгууллагын лавлагаа. Креденшлгүй бол домэйн инерт
  // (байгууллага холбох үед "тохируулагдаагүй" алдаа), boot зогсохгүй.
  const xypClient = newXypClient(
    AppConfig.XYP_API_BASE,
    AppConfig.XYP_CLIENT_ID,
    AppConfig.XYP_CLIENT_SECRET,
  );
  // SSO (гадаад OIDC provider) руу RP-ийн үүргээр холбогдох client + иргэний
  // токеныг шифрлэн хадгалах үйлчилгээ.
  const ssoOidc = newOIDCClient(
    AppConfig.SSO_ISSUER,
    AppConfig.SSO_CLIENT_ID,
    AppConfig.SSO_CLIENT_SECRET,
    AppConfig.SSO_REDIRECT_URI,
    AppConfig.SSO_SCOPE,
  );
  // sso_tokens нь INTEGRATION_ENC_KEY-ээс гарсан шифрлэгчээр хадгалагдана —
  // интеграцийн токентой ижил түлхүүр (нэг л нууц удирдана).
  const ssoTokenUC = newSSOTokenUsecase(
    newSSOTokenRepository(db, newCipher(AppConfig.INTEGRATION_ENC_KEY)),
    ssoOidc,
  );

  // SSO eID proxy — тохируулагдсан бол PKI самбар SSO-гоор дамжина (энэ RP-д
  // PKI_READ эрх шаардахгүй). Proxy + токен үйлчилгээ ХОЁУЛАА байж л идэвхжинэ.
  const ssoEidProxy =
    AppConfig.SSO_EID_PROXY_BASE_URL === ''
      ? null
      : newSSOEidProxy(AppConfig.SSO_EID_PROXY_BASE_URL);
  // SSO нэвтрэлтийн урсгал. Токен хадгалагч нь eID proxy идэвхтэй үед л
  // залгагдана; хандалтын горим уншигч нь private платформын хаалт.
  const ssoUC = newSSOUsecase(
    ssoOidc,
    newSSOUserRepository(db),
    jwtService,
    redisCache,
    AppConfig.SSO_NATIVE_CLIENT_ID,
    ssoEidProxy === null ? null : ssoTokenUC,
    newPlatformSettingsRepository(db),
  );

  const authUC = newAuthUsecase(
    usersUC,
    jwtService,
    eidClient,
    xypClient,
    googleClient,
    redisCache,
    {
      eidDisplayText: AppConfig.EID_DISPLAY_TEXT,
      ssoEidProxy,
      ssoTokens: ssoEidProxy === null ? null : ssoTokenUC,
    },
  );

  // RBAC — динамик role/permission. Мөн requirePermission-ийн resolver.
  const rbacRepo = newRBACRepository(db);
  const rbacUC = newRBACUsecase(rbacRepo);

  // Audit — hash-chained, append-only бүртгэл. Бичилт нь өөрийн "service" GUC
  // дор явдаг тул хүсэлтийн identity-аас үл хамаарна.
  const auditUC = newAuditUsecase(newAuditRepository(db));

  // Site харагдац + landing theme — нийтийн config (RLS-д хамаарахгүй). Хоёулаа
  // богино TTL кэштэй: нэвтрээгүй зочны landing тэднийг хүсэлт бүрд уншдаг.
  const siteUC = newSiteUsecase(newSiteRepository(db));
  const themeUC = newThemeUsecase(newThemeRepository(db));

  // Gerege Core — иргэн/байгууллагын хайлт. CORE_API_TOKEN хоосон бол домэйн
  // инерт (500 биш, тохируулаагүй гэсэн мессеж) — оператор дараа идэвхжүүлнэ.
  const coreUC = newCoreUsecase(AppConfig.CORE_API_BASE, AppConfig.CORE_API_TOKEN);

  // Security event — RASP-style ингест (хэрэглэгчийн RLS дор) + admin жагсаалт.
  const securityUC = newSecurityUsecase(newSecurityEventRepository(db));

  // Ring R1 — үйлчилгээний нэгдсэн регистр (паспорт · нотолгоо · once-only).
  const registryUC = newRegistryUsecase(newRegistryRepository(db));

  // Интеграци — гуравдагч талын OAuth токен (AES-256-GCM-ээр шифрлэнэ).
  // Production-д INTEGRATION_ENC_KEY ЗААВАЛ — эс бөгөөс токенууд нийтэд
  // мэдэгдэх default түлхүүрээр "шифрлэгдэж" бодитоор ил хэвтэнэ.
  const integrationsUC = newIntegrationsUsecase(
    newUserIntegrationsRepository(db),
    AppConfig.INTEGRATION_ENC_KEY,
    AppConfig.ENVIRONMENT === 'production',
  );

  // Applications — gateway consumer + SSO RP. OAuth2 client бүртгэл дээр
  // суурилдаг тул oauth_clients repo + service↔scope хөрвүүлэгчээс хамаарна.
  const applicationsUC = newApplicationsUsecase(
    newServiceScopeResolver(db),
    newOAuthClientRepository(db),
  );

  // Gerege Space — хэрэглэгчийн өөрийн файлын SFTP хадгалалт. Креденшлгүй бол
  // домэйн инерт (endpoint бүр "тохируулаагүй" гэсэн алдаа өгнө), boot зогсохгүй.
  const gspaceUC = newGSpaceUsecase(
    newGSpaceClient({
      host: AppConfig.GSPACE_HOST,
      port: AppConfig.GSPACE_PORT,
      user: AppConfig.GSPACE_USER,
      password: AppConfig.GSPACE_PASSWORD,
      basePath: AppConfig.GSPACE_BASE_PATH,
      hostKey: AppConfig.GSPACE_HOST_KEY,
      // Production-д host key ЗААВАЛ шаардлагатай (MITM-аас хамгаална).
      allowInsecureHostKey: AppConfig.ENVIRONMENT !== 'production',
    }),
    AppConfig.GSPACE_QUOTA_BYTES,
  );

  // Байгууллага + гишүүнчлэл. Эрх олголт usecase давхаргад; RLS зөвхөн
  // мөрийн харагдах байдлыг хариуцна.
  const orgUC = newOrgUsecase(newOrgRepository(db));

  // Гарын үсэг / байгууллагын тамга — байгууллагын эрхийг eID-ээр шалгана.
  const assetsUC = newAssetsUsecase(usersUC, userRepo, newOrgStampRepository(db), eidClient);

  const deps: Deps = {
    db,
    redisCache,
    jwtService,
    usersUC,
    authUC,
    rbacUC,
    auditUC,
    siteUC,
    themeUC,
    coreUC,
    securityUC,
    ssoUC,
    registryUC,
    assetsUC,
    orgUC,
    gspaceUC,
    gatewayUC,
    applicationsUC,
    integrationsUC,
    // SSO eID proxy нь SSO_EID_PROXY_BASE_URL тохируулагдсан үед идэвхжинэ.
    eidProxyEnabled: AppConfig.SSO_EID_PROXY_BASE_URL !== '',
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
