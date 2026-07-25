// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { AlgRS256 } from './keys.js';

/**
 * Endpoint-уудын зам — nginx-ийн одоогийн proxy дүрмүүдтэй ЯГ таарна, тиймээс
 * cutover нь зөвхөн upstream солих ажил болно.
 */
export const PathAuthorize = '/oauth2/auth';
export const PathToken = '/oauth2/token';
export const PathRevoke = '/oauth2/revoke';
export const PathIntrospect = '/oauth2/introspect';
export const PathEndSession = '/oauth2/sessions/logout';
export const PathUserinfo = '/userinfo';
export const PathJWKS = '/.well-known/jwks.json';
export const PathDiscovery = '/.well-known/openid-configuration';

export const ScopeOpenID = 'openid';
export const ScopeOfflineAccess = 'offline_access';

/**
 * advertisedScopes нь discovery-д зарлах scope-ууд. САНААТАЙГААР статик:
 * бүртгэгдсэн client-уудын scope-ийн нэгдлийг зарлавал дотоод gateway
 * service-ийн нэрс (`svc:*`) нийтэд ил болно.
 */
const advertisedScopes = [ScopeOpenID, ScopeOfflineAccess, 'profile', 'email', 'nationalid'];

/**
 * buildDiscovery нь issuer-ээс OpenID Connect Discovery 1.0-ийн баримтыг
 * угсарна.
 *
 * ЭНЭ БОЛ ГАДААД ГЭРЭЭ: RP-ийн сангууд болон мобайл апп үүнийг татаж endpoint,
 * дэмжигдэх алгоритм, scope-уудыг мэддэг. Талбар хасах нь RP-үүдийг эвдэж
 * болзошгүй.
 */
export function buildDiscovery(issuer: string): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: issuer + PathAuthorize,
    token_endpoint: issuer + PathToken,
    userinfo_endpoint: issuer + PathUserinfo,
    jwks_uri: issuer + PathJWKS,
    revocation_endpoint: issuer + PathRevoke,
    introspection_endpoint: issuer + PathIntrospect,
    end_session_endpoint: issuer + PathEndSession,

    scopes_supported: advertisedScopes,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    // Зөвхөн public — production дахь бүх client `public` байсан тул
    // pairwise-ийг огт хэрэгжүүлээгүй.
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [AlgRS256],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    // S256 ЗӨВХӨН — "plain" нь PKCE-ийн хамгаалалтыг утгагүй болгодог
    // (RFC 9700 §2.1.1), тиймээс огт зарлахгүй.
    code_challenge_methods_supported: ['S256'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'name',
      'given_name',
      'family_name',
      'given_name_en',
      'family_name_en',
      'email',
      'email_verified',
      'national_id',
      'register_number',
      'google_sub',
      'google_email',
      'google_name',
      'google_picture',
    ],
    // `request` / `request_uri` (JAR)-ыг дэмжихгүй — хэрэглэгддэггүй бөгөөд
    // SSRF-ийн гадаргуу нэмдэг.
    userinfo_signing_alg_values_supported: ['none'],
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    require_request_uri_registration: true,
  };
}
