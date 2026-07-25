import 'server-only';
import { NextResponse } from 'next/server';
import type { ApiResult } from './api';

// BFF route handler-уудын хуваалцсан туслахууд.

/** Request body-г аюулгүйгээр JSON болгож уншина. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * CSRF-ийн эсрэг хоёр давхар хамгаалалт. State-changing route-ууд дээр:
 *
 *  1. Custom header (`x-dgov-csrf: 1`) шаардана — cross-site form POST
 *     custom header тавьж чаддаггүй, cross-origin fetch нь preflight-д
 *     CORS-оор хаагддаг тул энэ header нь хүсэлт өөрийн JS-ээс
 *     (lib/client.ts sendJSON) гарсныг баталдаг. SameSite=Lax-ийн
 *     top-level navigation цонхыг (form POST) бүрэн хаана.
 *  2. `Origin` толгой байвал аппын origin-той тулгана (APP_ORIGIN env,
 *     эсвэл хүсэлтийн өөрийн URL).
 *
 * Зөрвөл 403 буцаах NextResponse-г, тааралцвал `null`-г буцаана.
 */
export function checkOrigin(req: Request): NextResponse | null {
  if (req.headers.get('x-dgov-csrf') !== '1') {
    return NextResponse.json(
      { ok: false, status: 403, message: 'CSRF header дутуу байна.' },
      { status: 403 },
    );
  }

  const origin = req.headers.get('origin');
  if (!origin) return null; // Origin байхгүй (non-browser) — header шалгалт хангалттай.

  const expected = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  if (origin === expected) return null;

  return NextResponse.json(
    { ok: false, status: 403, message: 'Origin тохирохгүй байна.' },
    { status: 403 },
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_ID_RE = /^\d{1,10}$/;
// Hydra OAuth2 client_id — UUID биш (жишээ нь "template-dgov-mn", "app-1a2b3c4d").
const CLIENT_ID_RE = /^[A-Za-z0-9._~-]{1,128}$/;

function invalidID(): NextResponse {
  return NextResponse.json({ ok: false, status: 400, message: 'ID буруу байна.' }, { status: 400 });
}

/** Dynamic route-ийн UUID параметрийг шалгана (хэрэглэгчийн id). Буруу бол 400. */
export function checkUUID(id: string): NextResponse | null {
  return UUID_RE.test(id) ? null : invalidID();
}

/**
 * Dynamic route-ийн OAuth2 client_id параметрийг шалгана (application id).
 * Application-ыг Hydra эзэмшдэг тул id нь client_id — UUID БИШ
 * (жишээ нь "template-dgov-mn", "app-1a2b3c4d").
 */
export function checkClientID(id: string): NextResponse | null {
  return CLIENT_ID_RE.test(id) ? null : invalidID();
}

/** Dynamic route-ийн бүхэл тоон id-г шалгана (role id г.м.). Буруу бол 400. */
export function checkIntID(id: string): NextResponse | null {
  return INT_ID_RE.test(id) ? null : invalidID();
}

/**
 * backend ApiResult-г browser рүү буцаах client хэлбэрт хувиргана. Токен зэрэг
 * нууц талбарыг хэзээ ч client рүү гаргахгүй — зөвхөн ok/status/message/fieldErrors.
 */
export function toClientResponse(r: ApiResult<unknown>): NextResponse {
  const httpStatus = r.ok ? 200 : r.status >= 400 && r.status < 600 ? r.status : 502;
  return NextResponse.json(
    {
      ok: r.ok,
      status: r.status,
      message: r.message,
      ...(r.ok ? {} : { fieldErrors: r.fieldErrors }),
    },
    { status: httpStatus },
  );
}

/**
 * toClientResponse-тэй адил боловч өгөгдлийг (data) клиент рүү дамжуулна.
 * Admin/RBAC жагсаалт зэрэг нууц БУС өгөгдлийг буцаах BFF route-уудад ашиглана
 * (хэзээ ч токен агуулдаггүй).
 */
export function proxyResult<T>(r: ApiResult<T>): NextResponse {
  const httpStatus = r.ok ? 200 : r.status >= 400 && r.status < 600 ? r.status : 502;
  return NextResponse.json(
    {
      ok: r.ok,
      status: r.status,
      message: r.message,
      ...(r.ok ? { data: r.data } : { fieldErrors: r.fieldErrors }),
    },
    { status: httpStatus },
  );
}
