// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Router } from 'express';

import { AppConfig, issuer } from '../../config/config.js';
import { configuredProviders } from '../../pkg/oauthproviders/oauthproviders.js';
import { newSuccessResponse, wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerMetaRoutes нь платформын мета endpoint-уудыг бүртгэнэ — API-ийн
 * хувилбар, ажиллаж буй орчны товч мэдээлэл. Эдгээр нь нэвтрэлт шаарддаггүй.
 */
export function registerMetaRoutes(router: Router, _deps: Deps): void {
  router.get(
    '/',
    wrap((req, res) => {
      newSuccessResponse(req, res, 200, 'Government Template Platform V3.0 API', {
        name: 'template-dgov-mn-nodejs',
        version: '3.0.0',
        stack: 'Node.js · Express 5 · PostgreSQL · Redis',
      });
    }),
  );

  /**
   * GET /config — SPA-д хэрэгтэй НУУЦ БИШ тохиргоо.
   *
   * BFF байхгүй тул browser нь Google-ийн зөвшөөрлийн URL-ыг өөрөө угсарна;
   * `client_id` нь угаасаа ил (consent дэлгэц дээр харагддаг) утга. Client
   * SECRET энд ХЭЗЭЭ Ч гарахгүй — code солилт зөвхөн сервер талд хийгддэг.
   * Мөн аль боломж тохируулагдсаныг мэдэгдэж, UI "тохируулаагүй" гэдгийг зөв
   * харуулна (эс бөгөөс товч дарж 500 авна).
   */
  router.get(
    '/config',
    wrap((req, res) => {
      newSuccessResponse(req, res, 200, 'public configuration', {
        google_client_id: AppConfig.GOOGLE_CLIENT_ID,
        issuer: issuer(),
        features: {
          google_login: AppConfig.GOOGLE_CLIENT_ID !== '',
          // SSO нь issuer ГАНЦААРАА биш — `/sso/start` нь client id/secret ба
          // redirect_uri хоёрыг бас шаарддаг (pkg/oidc-ийн `configured()`).
          // Зөвхөн issuer-ээр шалгавал UI нь дарахад 500 өгдөг товч харуулна.
          sso:
            AppConfig.SSO_ISSUER !== '' &&
            AppConfig.SSO_CLIENT_ID !== '' &&
            AppConfig.SSO_CLIENT_SECRET !== '' &&
            AppConfig.SSO_REDIRECT_URI !== '',
          ai: AppConfig.GEMINI_API_KEY !== '',
          sign: AppConfig.EID_RP_UUID !== '',
        },
        // Гуравдагч талын интеграцууд: аль нь ХОЛБОХ боломжтой (client id +
        // secret хоёулаа тохируулагдсан) вэ. UI үүгээр "Холбох" товчийг
        // харуулах/нуухаа шийднэ — тохируулаагүй үед дарж алдаа авахгүй.
        integrations: configuredProviders(),
      });
    }),
  );
}
