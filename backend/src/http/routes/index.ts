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
import type { AuditUsecase } from '../../usecases/audit/audit_usecase.js';
import type { ApplicationsUsecase } from '../../usecases/applications/applications_usecase.js';
import type { AssetsUsecase } from '../../usecases/assets/assets_usecase.js';
import type { AuthUsecase } from '../../usecases/auth/auth_usecase.js';
import type { CoreUsecase } from '../../usecases/core/core_usecase.js';
import type { GatewayUsecase } from '../../usecases/gateway/gateway_usecase.js';
import type { GSpaceUsecase } from '../../usecases/gspace/gspace_usecase.js';
import type { OrgUsecase } from '../../usecases/org/org_usecase.js';
import type { RBACUsecase } from '../../usecases/rbac/rbac_usecase.js';
import type { SecurityUsecase } from '../../usecases/security/security_usecase.js';
import type { SiteUsecase, ThemeUsecase } from '../../usecases/site/site_usecase.js';
import type { UsersUsecase } from '../../usecases/users/users_usecase.js';
import type { RateLimiter } from '../middlewares/ratelimit.js';
import type { Middleware } from '../types.js';
import { registerApplicationsRoutes } from './route_applications.js';
import { registerAssetsRoutes } from './route_assets.js';
import { registerAuditRoutes } from './route_audit.js';
import { registerAuthRoutes } from './route_auth.js';
import { registerCoreRoutes } from './route_core.js';
import { registerEidProfileRoutes } from './route_eidprofile.js';
import { registerMetaRoutes } from './route_meta.js';
import { registerGatewayRoutes } from './route_gateway.js';
import { registerGSpaceRoutes } from './route_gspace.js';
import { registerOrgRoutes } from './route_org.js';
import { registerRBACRoutes } from './route_rbac.js';
import { registerSecurityRoutes } from './route_security.js';
import { registerSiteRoutes } from './route_site.js';
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
   * auditUC нь hash-chained audit log. Нэвтрэлт/RBAC-ийн handler-ууд түүнд
   * best-effort бичдэг тул хамаарал нь ил байх ёстой.
   */
  auditUC: AuditUsecase;
  /** siteUC нь сайтын нийтийн харагдацын default (landing уншина). */
  siteUC: SiteUsecase;
  /** themeUC нь landing-ийн нэрлэсэн загварууд (CRUD + идэвхтэй сонголт). */
  themeUC: ThemeUsecase;
  /**
   * coreUC нь Gerege Core (core.gerege.mn)-ийн иргэн/байгууллага хайлт. Үндэсний
   * бүртгэлийн PII-д хүрдэг тул `users.manage` эрхээр хамгаалагдана.
   */
  coreUC: CoreUsecase;
  /** securityUC нь RASP-style security event-ийн ингест + admin жагсаалт. */
  securityUC: SecurityUsecase;
  /**
   * assetsUC нь гарын үсэг · байгууллагын тамга · латин нэр. Байгууллагын
   * эрхийг eID (улсын бүртгэл)-ээр шалгадаг тул eID client-аас хамаарна.
   */
  assetsUC: AssetsUsecase;
  /**
   * orgUC нь байгууллага + гишүүнчлэл. Эрх олголт (owner/admin) нь usecase
   * давхаргад тул route-д нэмэлт gate байхгүй.
   */
  orgUC: OrgUsecase;
  /** gspaceUC нь хэрэглэгчийн өөрийн файлын SFTP хадгалалт (квоттой). */
  gspaceUC: GSpaceUsecase;
  /** gatewayUC нь API Gateway-ийн admin гадаргуу (service CRUD + телеметр). */
  gatewayUC: GatewayUsecase;
  /**
   * applicationsUC нь gateway consumer + SSO RP-ийг нэгтгэсэн апп бүртгэл
   * (OAuth2 client + зөвшөөрсөн service scope).
   */
  applicationsUC: ApplicationsUsecase;
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
  registerMetaRoutes(router, deps);
  registerApplicationsRoutes(router, deps);
  registerAssetsRoutes(router, deps);
  registerAuditRoutes(router, deps);
  registerAuthRoutes(router, deps);
  registerCoreRoutes(router, deps);
  registerEidProfileRoutes(router, deps);
  registerGatewayRoutes(router, deps);
  registerGSpaceRoutes(router, deps);
  registerOrgRoutes(router, deps);
  registerRBACRoutes(router, deps);
  registerSecurityRoutes(router, deps);
  registerSiteRoutes(router, deps);
  registerUsersRoutes(router, deps);
}
