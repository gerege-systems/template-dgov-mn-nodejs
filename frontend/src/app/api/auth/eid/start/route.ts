import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// eID нэвтрэлтийн эхлэл — backend /auth/eid/start руу прокси. Энд токен
// үүсэхгүй тул start өгөгдлийг (session_id, device_link_url, verification_code,
// expires_at) клиент рүү шууд дамжуулна. State-changing тул checkOrigin эхэлнэ.
export interface EidStartData {
  session_id: string;
  device_link_url: string;
  verification_code: string;
  expires_at: string;
}

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  // callbackUrl (сонголт): SAME-DEVICE (mobile browser) үед клиент <origin>/auth/eid/callback
  // дамжуулна — утас approve хийсний дараа browser-ийг тэр рүү буцаана. Байхгүй бол CROSS-DEVICE
  // (desktop QR — browser өөрөө poll хийнэ). Backend callbackUrl-ийг стандарт зам руу normalize хийнэ.
  let callbackUrl = '';
  try {
    const body = (await req.json()) as { callbackUrl?: unknown };
    if (typeof body?.callbackUrl === 'string') callbackUrl = body.callbackUrl;
  } catch {
    /* body-гүй → cross-device */
  }

  const result = await backendFetch<EidStartData>('/auth/eid/start', {
    method: 'POST',
    body: JSON.stringify({ callbackUrl }),
  });
  return proxyResult(result);
}
