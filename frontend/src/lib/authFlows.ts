// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Нэвтрэлтийн ГАДАГШ ЧИГЛҮҮЛЭХ урсгалууд. BFF байхгүй тул browser нь эхлээд
// API-аас зөвшөөрлийн URL авч, дараа нь өөрөө шилжинэ (өмнө BFF нь 302-оор
// хийдэг байсан).

import { postJSON } from './client';

/**
 * startSSOLogin нь Government SSO (OIDC) нэвтрэлтийг эхлүүлнэ: API нь state-ыг
 * Redis-д үүсгээд authorize URL буцаана; browser тийш шилжинэ. Амжилтгүй бол
 * нэвтрэх хуудсанд алдааны тэмдэглэгээтэй үлдэнэ.
 */
export async function startSSOLogin(next?: string): Promise<void> {
  const res = await postJSON<{ auth_url?: string }>('/sso/start', {});
  const url = (res.data?.auth_url ?? '').trim();
  if (url === '') {
    window.location.assign('/login?error=sso');
    return;
  }
  // `next`-ийг буцаж ирэхэд сэргээхээр локал хадгална (state нь серверийнх).
  if (next !== undefined && next !== '' && next !== '/') {
    try {
      window.sessionStorage.setItem('dgov:next', next);
    } catch {
      // sessionStorage хаагдсан (private горим) — нэвтрэлт зогсох шалтгаан биш.
    }
  }
  window.location.assign(url);
}

/** consumeNext нь SSO-оос буцаж ирэхэд хадгалсан замыг нэг удаа уншина. */
export function consumeNext(): string {
  try {
    const v = window.sessionStorage.getItem('dgov:next') ?? '';
    window.sessionStorage.removeItem('dgov:next');
    return v;
  } catch {
    return '';
  }
}

/**
 * googleAuthorizeUrl нь Google OAuth-ийн зөвшөөрлийн URL-ыг угсарна. client_id
 * нь НУУЦ БИШ (browser-т ил байдаг); code-ийг API талд солино.
 */
export function googleAuthorizeUrl(clientId: string, next?: string): string {
  const redirectUri = `${window.location.origin}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    ...(next !== undefined && next !== '' ? { state: next } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
