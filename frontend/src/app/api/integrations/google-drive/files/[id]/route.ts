import { NextResponse } from 'next/server';
import { getProviderAccessToken } from '@/lib/driveClient';
import { checkOrigin, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

const FILE_ID_RE = /^[A-Za-z0-9_-]{8,}$/;

async function token() {
  return getProviderAccessToken('google-drive');
}

// PUT /api/integrations/google-drive/files/{id} — файлын нэр солих (засах).
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  if (!FILE_ID_RE.test(params.id)) {
    return NextResponse.json({ ok: false, status: 400, message: 'ID буруу.' }, { status: 400 });
  }
  const t = await token();
  if (!t) return NextResponse.json({ ok: false, status: 401, message: 'Google Drive холбогдоогүй.' }, { status: 401 });

  const body = await readJson<{ name?: string }>(req);
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ ok: false, status: 400, message: 'Нэр хоосон байна.' }, { status: 400 });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${params.id}?fields=id,name`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    cache: 'no-store',
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, message: `Нэр солих алдаа (${res.status})` }, { status: res.status === 401 ? 401 : 502 });
  }
  return NextResponse.json({ ok: true, status: 200, data: await res.json() });
}

// DELETE /api/integrations/google-drive/files/{id} — файл устгах.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  if (!FILE_ID_RE.test(params.id)) {
    return NextResponse.json({ ok: false, status: 400, message: 'ID буруу.' }, { status: 400 });
  }
  const t = await token();
  if (!t) return NextResponse.json({ ok: false, status: 401, message: 'Google Drive холбогдоогүй.' }, { status: 401 });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${params.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    return NextResponse.json({ ok: false, status: res.status, message: `Устгах алдаа (${res.status})` }, { status: res.status === 401 ? 401 : 502 });
  }
  return NextResponse.json({ ok: true, status: 200 });
}
