import { NextResponse } from 'next/server';
import { getProviderAccessToken } from '@/lib/driveClient';
import { ensureDropboxGeregeFolder, dropboxApiArg, DROPBOX_FOLDER } from '@/lib/dropboxClient';
import { checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/integrations/dropbox/upload — файлыг "/Gerege" хавтас руу хуулна.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const token = await getProviderAccessToken('dropbox');
  if (!token) {
    return NextResponse.json({ ok: false, status: 401, message: 'Dropbox холбогдоогүй байна.' }, { status: 401 });
  }
  await ensureDropboxGeregeFolder(token);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, status: 400, message: 'Файл алга байна.' }, { status: 400 });
  }

  const arg = dropboxApiArg({ path: `${DROPBOX_FOLDER}/${file.name}`, mode: 'add', autorename: true, mute: false });
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': arg,
      'Content-Type': 'application/octet-stream',
    },
    body: await file.arrayBuffer(),
    cache: 'no-store',
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, message: `Хуулахад алдаа гарлаа (${res.status})` }, { status: res.status === 401 ? 401 : 502 });
  }
  return NextResponse.json({ ok: true, status: 200, data: await res.json() });
}
