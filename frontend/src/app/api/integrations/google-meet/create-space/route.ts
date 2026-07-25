import { NextResponse } from 'next/server';
import { getProviderAccessToken } from '@/lib/driveClient';
import { checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/integrations/google-meet/create-space — Google Meet-ийн видео
// уулзалтыг (space) шинээр үүсгэнэ. meetings.space.created scope-ийг ашиглах ба
// энэ scope нь зөвхөн АПП ӨӨРИЙН үүсгэсэн уулзалтыг хөнддөг — хэрэглэгчийн бусад
// уулзалт/календарийг хэзээ ч уншихгүй. Хариуд уулзалтын линк (meetingUri)
// буцаана. Токен зөвхөн server-тал ашиглагдана; CSRF header шаардана.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const token = await getProviderAccessToken('google-meet');
  if (!token) {
    return NextResponse.json(
      { ok: false, status: 401, message: 'Google Meet холбогдоогүй байна.' },
      { status: 401 },
    );
  }

  // accessType: TRUSTED — нэвтэрсэн (Google account-тай) хэрэглэгч шууд орно,
  // бусад нь хост зөвшөөрөх хүртэл хүлээнэ. Нотариатын уулзалтад танихгүй хүн
  // санамсаргүй нэвтрэхээс сэргийлэх аюулгүй анхдагч сонголт.
  const res = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { accessType: 'TRUSTED' } }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = res.status === 401
      ? 'Google Meet холболт хүчингүй боллоо. Холболтоо салгаад дахин холбоно уу.'
      : `Meet API алдаа (${res.status})`;
    return NextResponse.json(
      { ok: false, status: res.status, message: msg },
      { status: res.status === 401 ? 401 : 502 },
    );
  }
  const j = (await res.json()) as { name?: string; meetingUri?: string; meetingCode?: string };
  return NextResponse.json({
    ok: true,
    status: 200,
    data: { meetingUri: j.meetingUri, meetingCode: j.meetingCode },
  });
}
