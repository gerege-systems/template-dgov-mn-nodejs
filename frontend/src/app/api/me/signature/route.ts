import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';
import { getProviderAccessToken, uploadImageToDrive } from '@/lib/driveClient';

export const dynamic = 'force-dynamic';

// GET /api/me/signature — хадгалсан гарын үсгийн зургийн URL.
export async function GET() {
  return proxyResult(await authedFetch('/me/signature', { method: 'GET' }));
}

// POST /api/me/signature — зургийг (base64) хэрэглэгчийн Google Drive-д байршуулж,
// URL-ийг backend-д хадгална. body: { data, mime, name }.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson<{ data?: string; mime?: string; name?: string }>(req);
  if (!body.data) {
    return NextResponse.json({ ok: false, status: 400, message: 'Зураг дутуу байна' }, { status: 400 });
  }
  const token = await getProviderAccessToken('google-drive');
  if (!token) {
    return NextResponse.json({ ok: false, status: 400, message: 'Google Drive холбоогүй байна. Эхлээд Холболтууд хэсэгт холбоно уу.' }, { status: 400 });
  }
  const url = await uploadImageToDrive(token, body.name || 'signature.png', body.mime || 'image/png', Buffer.from(body.data, 'base64'));
  if (!url) {
    return NextResponse.json({ ok: false, status: 502, message: 'Google Drive-д байршуулж чадсангүй' }, { status: 502 });
  }
  return proxyResult(await authedFetch('/me/signature', { method: 'PUT', body: JSON.stringify({ url }) }));
}

// DELETE /api/me/signature — гарын үсгийг устгах (DB-ээс URL хасна).
export async function DELETE(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  return proxyResult(await authedFetch('/me/signature', { method: 'DELETE' }));
}
