import { NextResponse } from 'next/server';
import { getProviderAccessToken } from '@/lib/driveClient';
import { ensureDropboxGeregeFolder, DROPBOX_FOLDER } from '@/lib/dropboxClient';

export const dynamic = 'force-dynamic';

// GET /api/integrations/dropbox/files — Dropbox дахь "/Gerege" хавтасны контентыг
// жагсаана (байхгүй бол үүсгэнэ). Токен server-тал л ашиглагдана.
export async function GET() {
  const token = await getProviderAccessToken('dropbox');
  if (!token) {
    return NextResponse.json({ ok: false, status: 401, message: 'Dropbox холбогдоогүй байна.' }, { status: 401 });
  }
  await ensureDropboxGeregeFolder(token);

  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DROPBOX_FOLDER, recursive: false, limit: 200 }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = res.status === 401
      ? 'Dropbox холболт хүчингүй боллоо. Холболтоо салгаад дахин холбоно уу.'
      : `Dropbox API алдаа (${res.status})`;
    return NextResponse.json({ ok: false, status: res.status, message: msg }, { status: res.status === 401 ? 401 : 502 });
  }
  const j = (await res.json()) as { entries?: Array<Record<string, unknown>> };
  const files = (j.entries ?? []).map((e) => ({
    id: String(e.id ?? e.path_lower ?? e.name),
    name: String(e.name ?? ''),
    path: String(e.path_display ?? e.path_lower ?? ''),
    isFolder: e['.tag'] === 'folder',
    size: typeof e.size === 'number' ? e.size : undefined,
    modified: typeof e.server_modified === 'string' ? e.server_modified : undefined,
  }));
  return NextResponse.json({ ok: true, status: 200, data: files });
}
