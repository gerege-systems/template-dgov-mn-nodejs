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
import type { AIUsecase } from '../../usecases/ai/ai_usecase.js';
import type { AuditUsecase } from '../../usecases/audit/audit_usecase.js';
import type { ApplicationsUsecase } from '../../usecases/applications/applications_usecase.js';
import type { AssetsUsecase } from '../../usecases/assets/assets_usecase.js';
import type { AuthUsecase } from '../../usecases/auth/auth_usecase.js';
import type { CoreUsecase } from '../../usecases/core/core_usecase.js';
import type { GatewayUsecase } from '../../usecases/gateway/gateway_usecase.js';
import type { GovUsecase } from '../../usecases/gov/gov_usecase.js';
import type { GSpaceUsecase } from '../../usecases/gspace/gspace_usecase.js';
import type { ProviderOps } from '../../usecases/integrations/integrations_provider.js';
import type { IntegrationsUsecase } from '../../usecases/integrations/integrations_usecase.js';
import type { OrgUsecase } from '../../usecases/org/org_usecase.js';
import type { ProviderUsecase } from '../../usecases/provider/provider_usecase.js';
import type { RBACUsecase } from '../../usecases/rbac/rbac_usecase.js';
import type { RegistryUsecase } from '../../usecases/registry/registry_usecase.js';
import type { RelayUsecase } from '../../usecases/relay/relay_usecase.js';
import type { SecurityUsecase } from '../../usecases/security/security_usecase.js';
import type { SignUsecase } from '../../usecases/sign/sign_usecase.js';
import type { SSOUsecase } from '../../usecases/sso/sso_usecase.js';
import type { SiteUsecase, ThemeUsecase } from '../../usecases/site/site_usecase.js';
import type { SuperadminUsecase } from '../../usecases/superadmin/superadmin_usecase.js';
import type { OnboardingUsecase } from '../../usecases/superadmin_onboarding/onboarding_usecase.js';
import type { UsersUsecase } from '../../usecases/users/users_usecase.js';
import type { RateLimiter } from '../middlewares/ratelimit.js';
import type { Middleware } from '../types.js';
import { registerAdminRoutes } from './route_admin.js';
import { registerAIRoutes } from './route_ai.js';
import { registerApplicationsRoutes } from './route_applications.js';
import { registerAssetsRoutes } from './route_assets.js';
import { registerAuditRoutes } from './route_audit.js';
import { registerAuthRoutes } from './route_auth.js';
import { registerCoreRoutes } from './route_core.js';
import { registerEidProfileRoutes } from './route_eidprofile.js';
import { registerMetaRoutes } from './route_meta.js';
import { registerGatewayRoutes } from './route_gateway.js';
import { registerGovRoutes } from './route_gov.js';
import { registerGSpaceRoutes } from './route_gspace.js';
import { registerIntegrationsRoutes } from './route_integrations.js';
import { registerOrgRoutes } from './route_org.js';
import { registerProviderRoutes } from './route_provider.js';
import { registerRBACRoutes } from './route_rbac.js';
import { registerRegistryRoutes } from './route_registry.js';
import { registerRelayRoutes } from './route_relay.js';
import { registerSecurityRoutes } from './route_security.js';
import { registerSignRoutes } from './route_sign.js';
import { registerSiteRoutes } from './route_site.js';
import { registerSSORoutes } from './route_sso.js';
import { registerSuperadminRoutes } from './route_superadmin.js';
import { registerSuperadminOnboardRoutes } from './route_superadmin_onboard.js';
import { registerUsersRoutes } from './route_users.js';

/** Deps нь route бүртгэлд шаардлагатай бүх хамаарлын багц. */
export interface Deps {
  db: Db;
  redisCache: RedisCache;
  jwtService: JWTService;
  /** authMiddleware нь Bearer токен шаардах route-уудад суудаг. */
  authMiddleware: Middleware;
  /**
   * aiUC нь Gemini AI pipeline (чат · STT · TTS · орчуулга) болон түүний
   * тохируулдаг prompt давхаргууд.
   */
  aiUC: AIUsecase;
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
  /** ssoUC нь гадаад SSO (OIDC)-ээр нэвтрэх урсгал (eID-ийн зэрэгцээ 2 дахь арга). */
  ssoUC: SSOUsecase;
  /**
   * registryUC нь Ring R1 — үйлчилгээний нэгдсэн регистр (паспорт · нотолгоо ·
   * once-only · нийтийн каталог).
   */
  registryUC: RegistryUsecase;
  /**
   * providerUC нь платформыг OIDC provider болгосон login/consent/logout цөм
   * (`/oauth2/auth` challenge-ыг frontend-ийн зөвшөөрлийн хуудастай холбоно).
   */
  providerUC: ProviderUsecase;
  /**
   * relayUC нь platform-хоорондын хүсэлт дамжуулах + SLA хяналт (peer webhook,
   * reminder/overdue/escalate sweep).
   */
  relayUC: RelayUsecase;
  /**
   * superadminUC нь super admin-ий админ удирдлага, урилга (allow-list) болон
   * платформын хандалтын горим.
   */
  superadminUC: SuperadminUsecase;
  /**
   * onboardingUC нь урилгаар хаалттай super admin бүртгэлийн шидтэн болон
   * MFA-тай нэвтрэлтийн 2 дахь шат.
   */
  onboardingUC: OnboardingUsecase;
  /**
   * signUC нь PDF гарын үсэг (PAdES) — eID PIN2-оор баталгаажиж, eidmongolia-ийн
   * stamp эсвэл серверийн Document-Signer-ээр лацлагдана.
   */
  signUC: SignUsecase;
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
  /** integrationsUC нь хэрэглэгчийн гуравдагч талын OAuth токен (шифрлэгдсэн). */
  integrationsUC: IntegrationsUsecase;
  /**
   * providerOps нь тэр токенуудыг ашиглан гуравдагч талын API руу СЕРВЕР талаас
   * хандах давхарга (Drive · Dropbox · Meet) — статик SPA нууц агуулж чадахгүй.
   */
  providerOps: ProviderOps;
  /** gspaceUC нь хэрэглэгчийн өөрийн файлын SFTP хадгалалт (квоттой). */
  gspaceUC: GSpaceUsecase;
  /** govUC нь иргэний портал + менежерийн дараалал (хүсэлт, лавлагаа, төлбөр). */
  govUC: GovUsecase;
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
  registerAdminRoutes(router, deps);
  registerAIRoutes(router, deps);
  registerApplicationsRoutes(router, deps);
  registerAssetsRoutes(router, deps);
  registerAuditRoutes(router, deps);
  registerAuthRoutes(router, deps);
  registerCoreRoutes(router, deps);
  registerEidProfileRoutes(router, deps);
  registerGatewayRoutes(router, deps);
  registerGovRoutes(router, deps);
  registerGSpaceRoutes(router, deps);
  registerIntegrationsRoutes(router, deps);
  registerOrgRoutes(router, deps);
  registerProviderRoutes(router, deps);
  registerRBACRoutes(router, deps);
  registerRegistryRoutes(router, deps);
  registerRelayRoutes(router, deps);
  registerSecurityRoutes(router, deps);
  registerSignRoutes(router, deps);
  registerSiteRoutes(router, deps);
  registerSSORoutes(router, deps);
  registerSuperadminRoutes(router, deps);
  registerSuperadminOnboardRoutes(router, deps);
  registerUsersRoutes(router, deps);
}
