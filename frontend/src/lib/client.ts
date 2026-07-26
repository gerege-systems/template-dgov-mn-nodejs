// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Browser → API (ижил origin дахь `/api/v1/*`) рүү хандах ЦОРЫН ГАНЦ цэг.
//
// BFF БАЙХГҮЙ: SPA нь nginx-ээр статикаар үйлчлэгдэж, `/api/*` нь ТЭР Л
// origin дээр api контейнер руу проксилогддог. Тиймээс:
//   • session токенууд httpOnly cookie-д (API өөрөө тавьдаг) — ЖС уншихгүй;
//   • мутацийн хүсэлт бүр `x-dgov-csrf` толгойг ЖС-д уншигддаг `dgov_csrf`
//     cookie-оос хуулж зөөнө (double-submit; API талд тулгагдана);
//   • `credentials: 'same-origin'` — cookie автоматаар явна, гуравдагч
//     origin руу ХЭЗЭЭ Ч илгээгдэхгүй.

/** API-ийн суурь зам. nginx нь энэ угтварыг api контейнер руу проксилно. */
export const API_BASE = '/api/v1';

/** CSRF-ийн толгой ба cookie (backend-ийн http/cookies.ts-тэй ЯГ ижил нэр). */
export const CSRF_HEADER = 'x-dgov-csrf';
export const CSRF_COOKIE = 'dgov_csrf';

/** Envelope нь backend-ийн нэгдсэн дугтуй (BaseResponse). */
interface Envelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
  request_id?: string;
  errors?: { field: string; message: string }[];
}

export interface ClientResult<T = unknown> {
  ok: boolean;
  status: number;
  message?: string;
  /** fieldErrors нь 422 үед талбар бүрийн validation алдаа. */
  fieldErrors?: Record<string, string>;
  data?: T;
}

/** readCsrfToken нь ЖС-д уншигддаг CSRF cookie-г уншина ('' бол session алга). */
export function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

/** apiUrl нь замыг `/api/v1` угтвартай болгоно (аль хэдийн байвал хэвээр). */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith(API_BASE)) return path;
  return API_BASE + (path.startsWith('/') ? path : `/${path}`);
}

/** fieldErrorsOf нь backend-ийн validation алдааг талбар→мессеж болгоно. */
function fieldErrorsOf<T>(body: Envelope<T> | null): Record<string, string> | undefined {
  const data = body?.data as { errors?: { field: string; message: string }[] } | undefined;
  const list = body?.errors ?? data?.errors;
  if (!list || list.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const e of list) out[e.field] = e.message;
  return out;
}

/**
 * request нь дугтуйг тайлж нэгдсэн ClientResult буцаана. Сүлжээний алдаа нь
 * status=0 — дуудагч UI-д "сүлжээний алдаа" гэж ялгаж харуулна.
 */
async function request<T>(path: string, init: RequestInit): Promise<ClientResult<T>> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      // Cookie нь ЗӨВХӨН ижил origin руу — гуравдагч тал руу хэзээ ч явахгүй.
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    return { ok: false, status: 0, message: 'Сүлжээний алдаа. Дахин оролдоно уу.' };
  }

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // Хоосон бие (204 эсвэл файл) — доорх статусаар шийднэ.
  }

  return {
    ok: res.ok && body?.status !== false,
    status: res.status,
    message: body?.message,
    fieldErrors: fieldErrorsOf(body),
    data: body?.data,
  };
}

/**
 * sendJSON нь JSON биетэй МУТАЦИЙН хүсэлт илгээнэ. CSRF толгой ЗААВАЛ явна —
 * cookie-гоор баталгаажсан хүсэлтэд API түүнийг шаарддаг.
 */
export function sendJSON<T = unknown>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<ClientResult<T>> {
  return request<T>(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      [CSRF_HEADER]: readCsrfToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const postJSON = <T = unknown>(path: string, body?: unknown): Promise<ClientResult<T>> =>
  sendJSON<T>(path, 'POST', body);
export const putJSON = <T = unknown>(path: string, body?: unknown): Promise<ClientResult<T>> =>
  sendJSON<T>(path, 'PUT', body);
export const deleteJSON = <T = unknown>(path: string, body?: unknown): Promise<ClientResult<T>> =>
  sendJSON<T>(path, 'DELETE', body);

/** sendForm нь multipart (файл) хүсэлт илгээнэ — Content-Type-ыг browser тавина. */
export function sendForm<T = unknown>(path: string, form: FormData): Promise<ClientResult<T>> {
  return request<T>(path, {
    method: 'POST',
    headers: { [CSRF_HEADER]: readCsrfToken() },
    body: form,
  });
}

/** ApiError нь GET урсгалын алдаа — TanStack Query түүнийг барина. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * getJSON нь GET хүсэлт илгээж ЗӨВХӨН `data`-г буцаана; алдаа дээр ApiError
 * шиднэ (TanStack Query-ийн queryFn-д тохирно).
 */
export async function getJSON<T = unknown>(path: string): Promise<T> {
  const res = await request<T>(path, { method: 'GET' });
  if (!res.ok) throw new ApiError(res.status, res.message ?? 'Хүсэлт амжилтгүй боллоо');
  return res.data as T;
}

/**
 * getResult нь GET хүсэлтийг ШИДЭЛГҮЙ гүйцэтгэж бүтэн ClientResult буцаана —
 * HTTP статус нь өөрөө утга агуулах үед (жишээ нь PKI самбар 403-ыг "эрх
 * хүлээгдэж байна" төлөв болгон ялгадаг) getJSON-ий оронд үүнийг хэрэглэнэ.
 */
export function getResult<T = unknown>(path: string): Promise<ClientResult<T>> {
  return request<T>(path, { method: 'GET' });
}

/** getRaw нь түүхий Response буцаана (файл татах — PDF, WAV г.м.). */
export function getRaw(path: string): Promise<Response> {
  return fetch(apiUrl(path), { credentials: 'same-origin' });
}
