// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { postJSON } from './client';

/**
 * signOut нь session-ийг СЕРВЕР талд дуусгана: refresh jti устаж, access токен
 * deny-list-д ороод, API нь httpOnly cookie-г цэвэрлэнэ. Дараа нь browser-ийг
 * бүрэн ачаалснаар клиент талын бүх кэш (TanStack Query) арилна.
 *
 * SSO-гоор нэвтэрсэн бол API нь RP-initiated logout URL-ыг өгвөл тийш
 * чиглүүлнэ — эс бөгөөс IdP дээрх session амьд үлдэж, дахин "автоматаар"
 * нэвтэрч орно.
 */
export async function signOut(): Promise<void> {
  // Токенууд cookie-д тул биед юу ч дамжуулах шаардлагагүй.
  const res = await postJSON<{ sso_logout_url?: string }>('/auth/logout', {});
  const url = (res.data?.sso_logout_url ?? '').trim();
  window.location.assign(url === '' ? '/' : url);
}
