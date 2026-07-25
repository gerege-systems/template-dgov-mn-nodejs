import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api';
import { setSession } from '@/lib/session';
import { checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/sso/native — native (iOS) OIDC урсгалын код солилцоо. Апп нь
// ASWebAuthenticationSession + PKCE-ээр authorization code авч энд илгээнэ; backend
// /sso/native нь public client-ээр (code_verifier, secret-гүй) солиж, template
// session (token хос)-ыг буцаана. Токеныг httpOnly cookie-д суулгаж (клиент рүү
// гаргахгүй), апп-ын URLSession дараагийн хүсэлтэд cookie-гоор нэвтэрнэ.
// State-changing тул checkOrigin (x-dgov-csrf) эхэлнэ.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { code, code_verifier, redirect_uri } = await readJson<{
    code?: string; code_verifier?: string; redirect_uri?: string;
  }>(req);

  if (!code || !code_verifier) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'code / code_verifier дутуу байна.' },
      { status: 400 },
    );
  }

  const r = await backendFetch<{ token?: string; refresh_token?: string }>('/sso/native', {
    method: 'POST',
    body: JSON.stringify({ code, code_verifier, redirect_uri: redirect_uri ?? '' }),
  });

  if (!r.ok || !r.data?.token || !r.data?.refresh_token) {
    return NextResponse.json(
      { ok: false, status: r.status, message: r.message || 'SSO нэвтрэлт амжилтгүй.' },
      { status: r.status >= 400 && r.status < 600 ? r.status : 502 },
    );
  }

  await setSession(r.data.token, r.data.refresh_token);
  return NextResponse.json({ ok: true });
}
