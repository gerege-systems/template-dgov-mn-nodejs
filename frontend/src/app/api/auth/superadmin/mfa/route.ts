import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backendFetch } from '@/lib/api';
import { setSession } from '@/lib/session';
import { checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/mfa — MFA-той superadmin нэвтрэлтийн 2 дахь хүчин зүйл.
// code = TOTP эсвэл recovery код. mfa_token-ийг body-оос (eID poll урсгал клиентэд
// өгдөг) эсвэл sa_mfa cookie-оос (Google callback server талд суулгасан) авна.
// Амжилттай бол token/refresh_token-ийг httpOnly cookie-д суулгаж, тэдгээрийг
// хариунаас ХАСна. used_recovery_code / recovery_codes_left зэргийг л клиент рүү гаргана.
interface MfaData {
  token?: string;
  refresh_token?: string;
  used_recovery_code?: boolean;
  recovery_codes_left?: number;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const jar = await cookies();
  const body = await readJson<{ mfa_token?: string; code?: string }>(req);
  const mfaToken = body.mfa_token || jar.get('sa_mfa')?.value;

  if (!mfaToken) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'mfa_token дутуу байна.' },
      { status: 400 },
    );
  }

  const result = await backendFetch<MfaData>('/auth/superadmin/mfa', {
    method: 'POST',
    body: JSON.stringify({ mfa_token: mfaToken, code: body.code }),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, status: result.status, message: result.message, fieldErrors: result.fieldErrors },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  const data = result.data ?? {};
  if (data.token && data.refresh_token) {
    await setSession(data.token, data.refresh_token);
    jar.delete('sa_mfa'); // нэг удаагийн MFA challenge cookie-г арилгана
  }

  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'token' || k === 'refresh_token') continue;
    safe[k] = v;
  }

  return NextResponse.json({ ok: true, status: result.status, data: safe }, { status: 200 });
}
