import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

// POST /api/relay/webhook — peer платформын webhook-ийг нийтийн BFF-ээр backend руу
// дамжуулна. Энэ бол server-to-server дуудлага (хэрэглэгчийн cookie/CSRF-гүй) —
// баталгаажуулалт нь backend дээрх HMAC гарын үсгээр хийгддэг тул биеийн ЯГ түүхий
// байтыг өөрчлөхгүйгээр дамжуулна (JSON дахин сериалчлахгүй, эс бөгөөс HMAC таарахгүй).
export async function POST(req: Request) {
  const base = (process.env.BACKEND_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  const raw = await req.text();

  const fwd: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') ?? 'application/json',
    'X-Relay-Source': req.headers.get('x-relay-source') ?? '',
    'X-Relay-Signature': req.headers.get('x-relay-signature') ?? '',
  };
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for') ?? h.get('x-real-ip');
    if (xff) fwd['x-forwarded-for'] = xff;
  } catch {
    // статик контекстэд header байхгүй байж болно — алгасна.
  }

  const resp = await fetch(`${base}/api/v1/relay/webhook`, { method: 'POST', headers: fwd, body: raw });
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('content-type') ?? 'application/json' },
  });
}
