import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// eID нэвтрэлтийн эхлэл (РД-ээр) — backend /auth/eid/start-id руу прокси.
// Иргэний регистрийн дугаараар нэвтрэх хүсэлт илгээж, иргэний eID апп руу
// push мэдэгдэл очно (QR гэхгүй — device_link_url буцахгүй). Энд токен
// үүсэхгүй тул start өгөгдлийг (session_id, verification_code, expires_at)
// клиент рүү шууд дамжуулна. State-changing тул checkOrigin эхэлнэ.
export interface EidStartIdData {
  session_id: string;
  verification_code: string;
  expires_at: string;
}

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const { national_id, callbackUrl } = await readJson<{ national_id?: string; callbackUrl?: string }>(req);

  if (!national_id) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'Регистрийн дугаар дутуу байна.' },
      { status: 400 },
    );
  }

  // callbackUrl (сонголт): SAME-DEVICE (утасны browser) үед клиент <origin>/auth/eid/callback
  // дамжуулна — push ижил утас руу ирж, approve-ийн дараа browser callback руу буцна. Хоосон бол
  // CROSS-DEVICE (desktop). Backend force-normalize хийнэ.
  const result = await backendFetch<EidStartIdData>('/auth/eid/start-id', {
    method: 'POST',
    body: JSON.stringify({ national_id, callbackUrl: typeof callbackUrl === 'string' ? callbackUrl : '' }),
  });
  return proxyResult(result);
}
