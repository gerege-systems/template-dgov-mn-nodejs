import { NextResponse } from 'next/server';
import { getProviderAccessToken, findOrCreateGeregeFolder } from '@/lib/driveClient';

export const dynamic = 'force-dynamic';

// GET /api/integrations/google-drive/files — зөвхөн апп-ын "Gerege" хавтасны
// доторх файлуудыг жагсаана (байхгүй бол хавтсыг үүсгэнэ). Токен server-тал л
// ашиглагдана.
export async function GET() {
  const token = await getProviderAccessToken('google-drive');
  if (!token) {
    return NextResponse.json({ ok: false, status: 401, message: 'Google Drive холбогдоогүй байна.' }, { status: 401 });
  }
  const folderId = await findOrCreateGeregeFolder(token);
  if (!folderId) {
    return NextResponse.json({ ok: false, status: 502, message: 'Gerege хавтсыг үүсгэж чадсангүй.' }, { status: 502 });
  }
  const q = `'${folderId}' in parents and trashed = false`;
  const fields = 'files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=200&orderBy=${encodeURIComponent('folder,name')}&fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) {
    const msg = res.status === 401
      ? 'Google Drive холболт хүчингүй боллоо. Холболтоо салгаад дахин холбоно уу.'
      : `Drive API алдаа (${res.status})`;
    return NextResponse.json({ ok: false, status: res.status, message: msg }, { status: res.status === 401 ? 401 : 502 });
  }
  const j = (await res.json()) as { files?: unknown[] };
  return NextResponse.json({ ok: true, status: 200, data: j.files ?? [] });
}
