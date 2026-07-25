import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backendFetch } from '@/lib/api';
import { setSession } from '@/lib/session';
import { checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// eID нэвтрэлтийн төлөв шалгах poll — backend /auth/eid/poll руу прокси.
// COMPLETE үед backend нь хэрэглэгчийг үүсгэж/олж токен олгосон байдаг тул
// токен хосыг httpOnly cookie-д суулгаад, клиент рүү ЗӨВХӨН {state} ба нууц
// БУС хэрэглэгчийн талбаруудыг буцаана — token/refresh_token хэзээ ч browser
// руу гарахгүй. State-changing тул checkOrigin эхэлнэ.

interface EidPollData {
  state: 'RUNNING' | 'COMPLETE' | 'EXPIRED' | 'REFUSED';
  token?: string;
  refresh_token?: string;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { session_id } = await readJson<{ session_id?: string }>(req);

  if (!session_id) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'session_id дутуу байна.' },
      { status: 400 },
    );
  }

  // Google-ээр эхний удаа нэвтэрч, eID-ээр холбож байгаа бол g_link cookie-д
  // link_token байна — backend руу дамжуулж COMPLETE үед холбуулна.
  const googleLink = (await cookies()).get('g_link')?.value;

  const result = await backendFetch<EidPollData>('/auth/eid/poll', {
    method: 'POST',
    body: JSON.stringify({
      session_id,
      ...(googleLink ? { google_link_token: googleLink } : {}),
    }),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, status: result.status, message: result.message },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  const data = result.data;

  // COMPLETE бол токен хосыг cookie-д суулгаад, нууц талбарыг хариунаас хасна.
  if (data?.state === 'COMPLETE' && data.token && data.refresh_token) {
    await setSession(data.token, data.refresh_token);
    // Google холболт дуусмагц түр cookie-г арилгана (нэг удаагийн).
    if (googleLink) (await cookies()).delete('g_link');
  }

  // Токен/refresh_token-ийг хасч, бусад нууц БУС талбарыг л клиент рүү гаргана.
  const safe: Record<string, unknown> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'token' || k === 'refresh_token') continue;
      safe[k] = v;
    }
  }

  return NextResponse.json(
    { ok: true, status: result.status, data: safe },
    { status: 200 },
  );
}
