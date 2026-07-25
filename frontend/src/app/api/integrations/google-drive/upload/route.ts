import { NextResponse } from 'next/server';
import { getProviderAccessToken, findOrCreateGeregeFolder } from '@/lib/driveClient';
import { checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/integrations/google-drive/upload — multipart файлыг Google Drive руу
// хуулна (multipart/related: метадата + контент). CSRF header шаардана.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const token = await getProviderAccessToken('google-drive');
  if (!token) {
    return NextResponse.json({ ok: false, status: 401, message: 'Google Drive холбогдоогүй байна.' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, status: 400, message: 'Файл алга байна.' }, { status: 400 });
  }

  // Gerege хавтсыг олж/үүсгээд тэр дотор хуулна.
  const folderId = await findOrCreateGeregeFolder(token);
  const boundary = `gerege${Date.now()}`;
  const meta = JSON.stringify(folderId ? { name: file.name, parents: [folderId] } : { name: file.name });
  const pre =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = new Blob([pre, file, post]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, status: res.status, message: `Хуулахад алдаа гарлаа (${res.status})` },
      { status: res.status === 401 ? 401 : 502 },
    );
  }
  const j = await res.json();
  return NextResponse.json({ ok: true, status: 200, data: j });
}
