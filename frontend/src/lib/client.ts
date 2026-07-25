// Browser → BFF (Next.js route handler) рүү хандах нимгэн туслах. Browser
// хэзээ ч Go backend руу шууд хандахгүй — зөвхөн адил origin дахь /api/*.

/**
 * CSRF-ийн эсрэг custom header (double defense). Cross-site form POST custom
 * header тавьж чаддаггүй, cross-origin fetch нь preflight-д CORS-оор
 * хаагддаг тул энэ header байгаа нь хүсэлт өөрийн JS-ээс гарсныг баталдаг.
 * BFF-ийн бүх state-changing route үүнийг шаарддаг (lib/bff.ts checkOrigin).
 */
export const CSRF_HEADER = 'x-dgov-csrf';

export interface ClientResult<T = unknown> {
  ok: boolean;
  status: number;
  message?: string;
  /** 422 үед backend-ийн талбар бүрийн validation алдаа. */
  fieldErrors?: Record<string, string>;
  /** Route data буцаадаг бол (proxyResult) — өгөгдөл. */
  data?: T;
}

/** JSON body-тэй state-changing хүсэлт (POST/PUT/DELETE) илгээнэ. */
export async function sendJSON<T = unknown>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<ClientResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        [CSRF_HEADER]: '1',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: ClientResult<T> | null = null;
    try {
      data = (await res.json()) as ClientResult<T>;
    } catch {
      /* body хоосон байж болно */
    }
    return {
      ok: data?.ok ?? res.ok,
      status: data?.status ?? res.status,
      message: data?.message,
      fieldErrors: data?.fieldErrors,
      data: data?.data,
    };
  } catch {
    return { ok: false, status: 0, message: 'Сүлжээний алдаа. Дахин оролдоно уу.' };
  }
}

/** JSON body-тэй POST хийгээд нэгдсэн ClientResult буцаана. */
export function postJSON<T = unknown>(path: string, body: unknown): Promise<ClientResult<T>> {
  return sendJSON<T>(path, 'POST', body);
}

/** GET хүсэлт — TanStack Query-гийн queryFn-д тохиромжтой; алдааг throw хийнэ. */
export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'GET' });
  const body = (await res.json().catch(() => null)) as ClientResult<T> | null;
  if (!body?.ok) throw new Error(body?.message || `Хүсэлт амжилтгүй (${res.status})`);
  return body.data as T;
}
