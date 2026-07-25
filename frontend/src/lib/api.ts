import 'server-only';
import { headers } from 'next/headers';
import type { Envelope, BackendUser, MeData, SessionUser } from './types';
import { toSessionUser } from './types';
import { getAccessToken, getRefreshToken, setSession, canPersistSession } from './session';

// Серверийн талд backend рүү хандах цорын ганц цэг.
// Browser энд хэзээ ч хүрэхгүй — зөвхөн route handler ба server component.

const BASE = (process.env.BACKEND_URL ?? 'http://localhost:8080').replace(/\/$/, '') + '/api/v1';

// forwardedForHeaders нь ирж буй хүсэлтээс жинхэнэ клиентийн IP-г (nginx
// тавьсан x-forwarded-for, эс бөгөөс x-real-ip) уншиж backend руу дамжуулах
// header болгоно. api нь нийтийн порт-гүй, зөвхөн энэ BFF-ээр дамждаг тул
// үүнгүйгээр бүх хүсэлт web контейнерийн IP дор орж, api-ийн per-IP rate-limit
// нэг bucket-д уначихна. api-ийн clientIP() нь TRUSTED_PROXIES-ийн дор XFF-г
// баруунаас нь (сүүлийн итгэмжгүй hop) уншдаг тул spoofing-д тэсвэртэй хэвээр —
// nginx client-ийн жинхэнэ RemoteAddr-г мөрийн төгсгөлд залгасан байдаг.
async function forwardedForHeaders(): Promise<Record<string, string>> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    if (xff) return { 'x-forwarded-for': xff };
    const xrip = h.get('x-real-ip');
    if (xrip) return { 'x-forwarded-for': xrip };
  } catch {
    // headers() зарим статик контекстэд байхгүй байж болно — чимээгүй алгасна.
  }
  return {};
}

export type ApiOk<T> = { ok: true; status: number; message?: string; data?: T };
export type ApiErr = { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };
export type ApiResult<T> = ApiOk<T> | ApiErr;

/** Дугтуйг тайлж, нэгдсэн ApiResult болгож буцаах суурь fetch. */
export async function backendFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(await forwardedForHeaders()), ...init?.headers },
    });
  } catch {
    return {
      ok: false,
      status: 503,
      message: 'Backend-тэй холбогдож чадсангүй. Сервер ажиллаж байгаа эсэхийг шалгана уу.',
    };
  }

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    /* хариу JSON биш (жишээ нь 502) — доор статусаар шийднэ */
  }

  // 2xx-г амжилттай гэж үзнэ. Хоосон body (204 эсвэл задлагдаагүй JSON →
  // body=null) бол status талбар шаардахгүй. Зөвхөн дугтуйд `status` boolean
  // тодорхой байгаа үед л `status:false`-г алдаа гэж тооцно.
  if (res.ok && (body === null || body.status !== false)) {
    return { ok: true, status: res.status, message: body?.message, data: body?.data };
  }

  // Backend нь талбарын алдааг массив ([{field,tag,message}]) хэлбэрээр
  // буцаадаг; клиент тал нь талбар→мессеж object хүлээдэг тул хэвийн болгоно.
  const rawErrors = (body?.data as { errors?: unknown } | undefined)?.errors;
  let fieldErrors: Record<string, string> | undefined;
  if (Array.isArray(rawErrors)) {
    fieldErrors = {};
    for (const item of rawErrors) {
      const fe = item as { field?: string; message?: string };
      if (fe?.field) fieldErrors[fe.field] = fe.message ?? '';
    }
  } else if (rawErrors && typeof rawErrors === 'object') {
    fieldErrors = rawErrors as Record<string, string>;
  }
  return {
    ok: false,
    status: res.status,
    message: body?.message ?? `Хүсэлт амжилтгүй (${res.status})`,
    fieldErrors,
  };
}

/** Refresh токеноор шинэ access токен авах. Амжилттай бол шинэ токенг буцаана. */
async function tryRefresh(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  // Backend refresh нь rotation хийдэг — хуучин refresh jti нэг удаад
  // хэрэглэгдээд устдаг. RSC render үед cookie бичих боломжгүй тул шинэ
  // хосыг хадгалж чадахгүй — тэгвэл хүчинтэй сессиэ шатаах байсан тул
  // refresh-ийг ОГТ дуудахгүй (дараагийн route handler хүсэлт refresh
  // хийгээд cookie-г зөв шинэчилнэ).
  if (!(await canPersistSession())) return null;
  const r = await backendFetch<BackendUser>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (r.ok && r.data?.token && r.data?.refresh_token) {
    await setSession(r.data.token, r.data.refresh_token);
    return r.data.token;
  }
  return null;
}

/**
 * Bearer токен хавсаргаж, 401 ирвэл нэг удаа reactive refresh хийгээд дахин
 * оролддог хамгаалагдсан дуудлага. Refresh бүтэлгүйтвэл анхны 401-г буцаана.
 */
export async function authedFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const withAuth = (token?: string) =>
    backendFetch<T>(path, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });

  const res = await withAuth(await getAccessToken());
  if (res.ok || res.status !== 401) return res;

  const newToken = await tryRefresh();
  if (!newToken) return res;
  return withAuth(newToken);
}

/**
 * Bearer токеноор backend руу хандаж, ТҮҮХИЙ Response-г буцаана (JSON тайлахгүй).
 * Файл татах зэрэг binary хариунд ашиглана. 401 ирвэл нэг удаа refresh оролдоно.
 */
export async function authedRaw(path: string, init?: RequestInit): Promise<Response> {
  const withAuth = async (token?: string) =>
    fetch(BASE + path, {
      ...init,
      cache: 'no-store',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(await forwardedForHeaders()), ...init?.headers },
    });

  const res = await withAuth(await getAccessToken());
  if (res.status !== 401) return res;
  const newToken = await tryRefresh();
  if (!newToken) return res;
  return withAuth(newToken);
}

export type MeResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: number };

/**
 * GET /users/me — бүтэлгүйтлийн ШАЛТГААНЫГ ялгаж буцаана. 401/403 бол сесси
 * үнэхээр үхсэн (refresh дууссан/rotation-д хэрэглэгдсэн) — cookie цэвэрлэж
 * дахин нэвтрүүлнэ; бусад статус (503/5xx) бол backend түр унтарсан — session-г
 * хадгална. AreaShell энэ ялгааг ашиглан redirect давталтаас сэргийлдэг.
 */
export async function getMe(): Promise<MeResult> {
  const r = await authedFetch<MeData>('/users/me', { method: 'GET' });
  if (r.ok && r.data?.user) return { ok: true, user: toSessionUser(r.data.user) };
  return { ok: false, status: r.status };
}

/** GET /users/me — нэвтэрсэн хэрэглэгчийн профайл, эсвэл null. */
export async function fetchMe(): Promise<SessionUser | null> {
  const r = await getMe();
  return r.ok ? r.user : null;
}

/** GET /rbac/me — нэвтэрсэн хэрэглэгчийн эрхийн түлхүүрүүд (хоосон массив fallback). */
export async function fetchMyPermissions(): Promise<string[]> {
  const r = await authedFetch<string[]>('/rbac/me', { method: 'GET' });
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

/** Сайтын нийтийн харагдацын default (админ тохируулдаг). accent нь preset нэр
 *  эсвэл '#rrggbb' custom hex. preferences.ts дахь VALID/DEFAULTS-тэй нийцнэ. */
export interface SiteAppearance {
  accent: string;
  font: 'inter' | 'serif' | 'system';
  style: 'comfortable' | 'compact';
  theme: 'light' | 'dark' | 'system';
}

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  accent: 'cobalt',
  font: 'inter',
  style: 'comfortable',
  theme: 'light',
};

/** GET /themes/active — нийтийн (auth-гүй) идэвхтэй landing theme-ийн config.
 *  Landing SSR энэ config-оор харагдац (палетр/фонт/стиль/загвар) + бүх текст/цэс-
 *  ийг рендерлэнэ. Backend унтарсан/theme байхгүй бол хоосон config (frontend нь
 *  copy.ts + globals.css default-ээ хэрэглэнэ) — хуудас хэзээ ч унахгүй. */
export async function fetchActiveTheme(): Promise<import('./theme').ThemeConfig> {
  const r = await backendFetch<{ config?: unknown }>('/themes/active', { method: 'GET' });
  const cfg = r.ok && r.data && typeof r.data.config === 'object' ? r.data.config : null;
  return (cfg as import('./theme').ThemeConfig) ?? { appearance: {}, landing: {} };
}

/** GET /site/appearance — нийтийн (auth-гүй) харагдацын default. Landing SSR-д
 *  <html>-ийн эхний data-* болон bootstrap fallback-д ашиглана. Backend унтарсан
 *  эсвэл алдаа гарвал template default-ыг буцаана (хуудас хэзээ ч унахгүй). */
export async function fetchSiteAppearance(): Promise<SiteAppearance> {
  const r = await backendFetch<Partial<SiteAppearance>>('/site/appearance', { method: 'GET' });
  if (!r.ok || !r.data) return DEFAULT_SITE_APPEARANCE;
  const d = r.data;
  return {
    accent: typeof d.accent === 'string' ? d.accent : DEFAULT_SITE_APPEARANCE.accent,
    font: d.font ?? DEFAULT_SITE_APPEARANCE.font,
    style: d.style ?? DEFAULT_SITE_APPEARANCE.style,
    theme: d.theme ?? DEFAULT_SITE_APPEARANCE.theme,
  };
}
