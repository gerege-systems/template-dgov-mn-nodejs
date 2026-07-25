import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';
import { getProviderAccessToken, uploadImageToDrive } from '@/lib/driveClient';

export const dynamic = 'force-dynamic';

// GET /api/me/eid/organizations/{regNo}/stamp — байгууллагын тамганы зургийн URL.
export async function GET(_req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  return proxyResult(await authedFetch(`/me/orgstamp/${encodeURIComponent(params.regNo)}`, { method: 'GET' }));
}

// POST — тамганы зургийг Drive-д байршуулж URL хадгална (backend талд ADMIN шалгана).
export async function POST(req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
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
  const url = await uploadImageToDrive(token, body.name || 'stamp.png', body.mime || 'image/png', Buffer.from(body.data, 'base64'));
  if (!url) {
    return NextResponse.json({ ok: false, status: 502, message: 'Google Drive-д байршуулж чадсангүй' }, { status: 502 });
  }
  return proxyResult(
    await authedFetch(`/me/orgstamp/${encodeURIComponent(params.regNo)}`, { method: 'PUT', body: JSON.stringify({ url }) }),
  );
}

// DELETE — тамгыг устгах (ADMIN).
export async function DELETE(req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/me/orgstamp/${encodeURIComponent(params.regNo)}`, { method: 'DELETE' }));
}
