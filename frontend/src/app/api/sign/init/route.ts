import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';
import { checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// PDF гарын үсэг эхлүүлэх — multipart body-г шууд Go backend руу дамжуулна.
// authedFetch/proxyResult нь JSON-only + дугтуй задалдаг тул multipart-д
// тохирохгүй; иймд getAccessToken-оор raw fetch хийнэ. checkOrigin (CSRF)
// заавал — EidSignView x-dgov-csrf header тавьж илгээдэг.
const BASE = (process.env.BACKEND_URL ?? 'http://localhost:8080').replace(/\/$/, '') + '/api/v1';

export async function POST(req: NextRequest) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const tok = await getAccessToken();
  if (!tok) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const form = await req.formData();
  try {
    const upstream = await fetch(`${BASE}/sign/init`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
      body: form,
      cache: 'no-store',
    });
    const text = await upstream.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    // Go дугтуй {data:{...}}-ийг задалж EidSignView хүлээдэг хавтгай хэлбэрт.
    const payload = (body as { data?: unknown })?.data ?? body;
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'backend_unreachable' }, { status: 503 });
  }
}
