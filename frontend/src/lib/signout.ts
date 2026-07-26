// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { postJSON } from './client';

/**
 * signOut нь session-ийг СЕРВЕР талд дуусгана: refresh jti устаж, access токен
 * deny-list-д ороод, API нь httpOnly cookie-г цэвэрлэнэ. Дараа нь browser-ийг
 * бүрэн ачаалснаар клиент талын бүх кэш (TanStack Query) арилна.
 *
 * SSO-гоор нэвтэрсэн бол IdP дээрх session-ийг МӨН дуусгана — эс бөгөөс
 * хэрэглэгч "гараад" дахин нэвтрэх товч дарахад IdP түүнийг таниад ЧИМЭЭГҮЙ
 * буцаан оруулна (гарсан мэт харагдаад үнэндээ гараагүй).
 *
 * ДАРААЛАЛ ЧУХАЛ: logout URL-ыг `/auth/logout`-ЫН ӨМНӨ авна — тэр нь SSO-гийн
 * ref cookie-г бусад session cookie-тай хамт цэвэрлэдэг.
 */
export async function signOut(): Promise<void> {
  // 1) SSO-гийн RP-initiated logout URL. Ref нь httpOnly cookie-д тул биед юу ч
  //    дамжуулахгүй — сервер өөрөө уншина. SSO-гоор нэвтрээгүй бол хоосон.
  //    BEST-EFFORT: энэ алхам унасан ч дараагийн алхам ажиллах ёстой.
  let ssoLogoutUrl = '';
  try {
    const sso = await postJSON<{ sso_logout_url?: string }>('/sso/logout', {});
    if (sso.ok) ssoLogoutUrl = (sso.data?.sso_logout_url ?? '').trim();
  } catch {
    // SSO тохируулаагүй / ref байхгүй — дотоод гарах нь хэвээр үргэлжилнэ.
  }

  // 2) Дотоод session-ийг дуусгана (cookie цэвэрлэгдэнэ).
  await postJSON('/auth/logout', {});

  // 3) SSO дээр ч гаргана; эс бөгөөс нүүр рүү.
  window.location.assign(ssoLogoutUrl === '' ? '/' : ssoLogoutUrl);
}
