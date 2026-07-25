import { NextResponse } from 'next/server';
import { getProviderAccessToken } from '@/lib/driveClient';

export const dynamic = 'force-dynamic';

// GET /api/integrations/dropbox/preview?path=/Gerege/file.png — тухайн файлын
// түр хугацааны (≈4ц) шууд линк буцаана (preview/татахад). path-г зөвхөн /Gerege
// доторх байхаар хязгаарлана.
export async function GET(req: Request) {
  const token = await getProviderAccessToken('dropbox');
  if (!token) {
    return NextResponse.json({ ok: false, status: 401, message: 'Dropbox холбогдоогүй байна.' }, { status: 401 });
  }
  const path = new URL(req.url).searchParams.get('path') || '';
  // Зөвхөн /Gerege доторх (том/жижиг үсгээс үл хамаарч).
  if (!path.toLowerCase().startsWith('/gerege/')) {
    return NextResponse.json({ ok: false, status: 400, message: 'Зам буруу байна.' }, { status: 400 });
  }
  const res = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
    cache: 'no-store',
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, message: `Линк авахад алдаа (${res.status})` }, { status: res.status === 401 ? 401 : 502 });
  }
  const j = (await res.json()) as { link?: string };
  return NextResponse.json({ ok: true, status: 200, data: { link: j.link ?? '' } });
}
