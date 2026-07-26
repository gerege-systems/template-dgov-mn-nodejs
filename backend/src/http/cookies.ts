// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Session cookie-ийн давхарга. SPA загварт токенуудыг API ӨӨРӨӨ httpOnly
// cookie-д тавьдаг тул browser-ийн JS тэдгээрийг ХЭЗЭЭ Ч уншихгүй (XSS-ээр
// токен хулгайлагдахгүй). Хариуны JSON биед токен хэвээр буцна — мобайл болон
// m2m клиентүүд Bearer толгойгоор ажилласаар байна.
//
// CSRF: cookie нь ambient credential тул мутацийн хүсэлт бүр `x-dgov-csrf`
// толгойг дагалдана; түүний утга нь ЖС-ээс УНШИГДАХ `dgov_csrf` cookie-тэй
// тааруулагдана (double-submit). Bearer-ээр ирсэн хүсэлт ambient биш тул
// энэ шалгалтад хамаарахгүй.

import { randomBytes } from 'node:crypto';

import { serialize, parse } from 'cookie';

import { AppConfig } from '../config/config.js';
import { EnvironmentProduction } from '../constants/index.js';
import type { Request, Response } from './types.js';

/** Access токены cookie — httpOnly. */
export const AccessCookie = 'dgov_access';
/** Refresh токены cookie — httpOnly. */
export const RefreshCookie = 'dgov_refresh';
/**
 * CSRF cookie — ЖС УНШИНА (httpOnly БИШ). Энэ нь нууц биш: зорилго нь
 * гуравдагч талын сайт header-т утгыг хуулж чадахгүй байх (same-origin
 * бодлого) — double-submit загвар.
 */
export const CsrfCookie = 'dgov_csrf';
/** CSRF-ийн толгой — мутацийн хүсэлт бүр үүнийг зөөнө. */
export const CsrfHeader = 'x-dgov-csrf';
/**
 * SSO-гийн logout ref — httpOnly. SSO-гоор нэвтэрсэн session-ийг ГАРАХ үед
 * IdP дээр ч дуусгахад хэрэгтэй богино түлхүүр (id_token өөрөө БИШ — тэр нь
 * том бөгөөд эмзэг тул Redis-д үлдэж, энд зөвхөн 32 hex ref явна).
 *
 * ЖС уншихгүй: SPA нь ref-ийг мэдэх шаардлагагүй — `POST /auth/logout` дээр
 * сервер өөрөө cookie-гоос уншиж logout URL-ыг буцаана.
 */
export const SsoLogoutCookie = 'dgov_sso_logout';

/**
 * Cookie-ийн насжилт. Backend-ийн анхдагч: JWT_EXPIRED=5 цаг,
 * JWT_REFRESH_EXPIRED=7 хоног. Хэтэрсэн access cookie-г refresh урсгал
 * шинэчилнэ.
 */
const accessMaxAgeSeconds = 60 * 60 * 5;
const refreshMaxAgeSeconds = 60 * 60 * 24 * 7;

/**
 * secureCookies нь Secure флагийг шийднэ. FAIL-CLOSED: COOKIE_SECURE
 * заагаагүй бол production-д ҮРГЭЛЖ Secure. Зөвхөн ил `'false'` өгсөн үед л
 * (дотоод http dev орчин) Secure-гүй болно.
 */
function secureCookies(): boolean {
  const explicit = AppConfig.COOKIE_SECURE.trim();
  if (explicit !== '') return explicit === 'true';
  return AppConfig.ENVIRONMENT === EnvironmentProduction;
}

/** appendCookie нь Set-Cookie толгойд нэг cookie нэмнэ (өмнөхийг дардаггүй). */
function appendCookie(res: Response, value: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (existing === undefined) {
    res.setHeader('Set-Cookie', value);
    return;
  }
  const list = Array.isArray(existing) ? existing.map(String) : [String(existing)];
  res.setHeader('Set-Cookie', [...list, value]);
}

/**
 * issueSessionCookies нь access/refresh токеныг httpOnly cookie-д тавьж, шинэ
 * CSRF токен өгнө. Session ОЛГОГДОХ БҮРД дуудагдана (нэвтрэлт, refresh, MFA,
 * onboarding төгсгөл) — токен хариуны биеэс ч хасагдахгүй тул мобайл клиент
 * өөрчлөгдөхгүй.
 */
export function issueSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = secureCookies();
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };

  if (accessToken !== '') {
    appendCookie(
      res,
      serialize(AccessCookie, accessToken, { ...base, maxAge: accessMaxAgeSeconds }),
    );
  }
  if (refreshToken !== '') {
    appendCookie(
      res,
      serialize(RefreshCookie, refreshToken, { ...base, maxAge: refreshMaxAgeSeconds }),
    );
  }
  // CSRF токен нь ЖС-д уншигдана (httpOnly БИШ) — SPA түүнийг толгойд хуулна.
  appendCookie(
    res,
    serialize(CsrfCookie, randomBytes(16).toString('hex'), {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshMaxAgeSeconds,
    }),
  );
}

/**
 * setSsoLogoutRef нь SSO-гийн logout ref-ийг httpOnly cookie-д тавина. Хоосон
 * ref (SSO-гоор нэвтрээгүй) үед юу ч хийхгүй.
 */
export function setSsoLogoutRef(res: Response, ref: string): void {
  if (ref === '') return;
  appendCookie(
    res,
    serialize(SsoLogoutCookie, ref, {
      httpOnly: true,
      secure: secureCookies(),
      sameSite: 'lax',
      path: '/',
      maxAge: refreshMaxAgeSeconds,
    }),
  );
}

/** ssoLogoutRefFromCookie нь SSO logout ref-ийг уншина ('' бол байхгүй). */
export const ssoLogoutRefFromCookie = (req: Request): string =>
  readCookies(req)[SsoLogoutCookie] ?? '';

/** clearSessionCookies нь гарах үед session cookie-г бүгдийг нь устгана. */
export function clearSessionCookies(res: Response): void {
  const secure = secureCookies();
  for (const [name, httpOnly] of [
    [AccessCookie, true],
    [RefreshCookie, true],
    [CsrfCookie, false],
    [SsoLogoutCookie, true],
  ] as const) {
    appendCookie(
      res,
      serialize(name, '', { httpOnly, secure, sameSite: 'lax', path: '/', maxAge: 0 }),
    );
  }
}

/**
 * oauthStateCookie нь гуравдагч талын OAuth урсгалын CSRF state cookie-ийн нэр.
 * Провайдер тус бүрд тусдаа — хэрэглэгч зэрэг хоёр холболт эхлүүлбэл нэг нь
 * нөгөөгийнхөө state-ийг дардаггүй байх ёстой.
 */
export const oauthStateCookie = (provider: string): string => `dgov_oauth_${provider}`;

/**
 * oauthStateMaxAgeSeconds нь state cookie-ийн нас — OAuth round-trip хийхэд
 * хангалттай ч алдагдсан утгын ашиглах цонхыг богино байлгана.
 */
const oauthStateMaxAgeSeconds = 10 * 60;

/** setOAuthStateCookie нь богино настай httpOnly state cookie тавина. */
export function setOAuthStateCookie(res: Response, provider: string, state: string): void {
  appendCookie(
    res,
    serialize(oauthStateCookie(provider), state, {
      httpOnly: true,
      secure: secureCookies(),
      // lax — провайдер буцаах нь top-level GET navigation тул cookie явна.
      sameSite: 'lax',
      path: '/',
      maxAge: oauthStateMaxAgeSeconds,
    }),
  );
}

/** clearOAuthStateCookie нь state cookie-г устгана (нэг удаад л хэрэглэнэ). */
export function clearOAuthStateCookie(res: Response, provider: string): void {
  appendCookie(
    res,
    serialize(oauthStateCookie(provider), '', {
      httpOnly: true,
      secure: secureCookies(),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }),
  );
}

/** readCookies нь хүсэлтийн Cookie толгойг задална (parse алдаа → хоосон). */
export function readCookies(req: Request): Record<string, string | undefined> {
  const header = req.get('cookie');
  if (!header) return {};
  try {
    return parse(header);
  } catch {
    return {};
  }
}

/** accessTokenFromCookie нь httpOnly access cookie-г уншина ('' бол байхгүй). */
export const accessTokenFromCookie = (req: Request): string => readCookies(req)[AccessCookie] ?? '';

/** refreshTokenFromCookie нь httpOnly refresh cookie-г уншина. */
export const refreshTokenFromCookie = (req: Request): string =>
  readCookies(req)[RefreshCookie] ?? '';
