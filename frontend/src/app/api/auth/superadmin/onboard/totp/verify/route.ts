import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api';
import { setSession } from '@/lib/session';
import { checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/onboard/totp/verify — онбордингийн ТӨГСГӨЛ. TOTP кодыг
// баталгаажуулмагц backend нь recovery_codes + токен хос буцаана. token/refresh_token-
// ийг httpOnly cookie-д суулгаж хэрэглэгчийг нэвтрүүлээд, тэдгээрийг хариунаас ХАСна.
// recovery_codes зэрэг нууц БУС талбарыг л клиент рүү гаргана (нэг удаа харагдана).
interface FinalizeData {
  token?: string;
  refresh_token?: string;
  recovery_codes?: string[];
  [key: string]: unknown;
}

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const body = await readJson(req);
  const result = await backendFetch<FinalizeData>('/auth/superadmin/onboard/totp/verify', {
    method: 'POST',
    body: JSON.stringify(body),
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
  }

  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'token' || k === 'refresh_token') continue;
    safe[k] = v;
  }

  return NextResponse.json({ ok: true, status: result.status, data: safe }, { status: 200 });
}
