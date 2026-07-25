import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/api';
import { proxyResult, toClientResponse, checkOrigin, checkUUID, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/admin/themes/{id} — нэг theme.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const badID = checkUUID(id);
  if (badID) return badID;
  return proxyResult(await authedFetch(`/themes/${id}`, { method: 'GET' }));
}

// PUT /api/admin/themes/{id} — theme шинэчлэх.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const badID = checkUUID(id);
  if (badID) return badID;
  const bad = checkOrigin(req);
  if (bad) return bad;
  const { name, config } = await readJson<{ name?: unknown; config?: unknown }>(req);
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80) {
    return NextResponse.json({ ok: false, status: 400, message: 'Нэр буруу байна.' }, { status: 400 });
  }
  return proxyResult(
    await authedFetch(`/themes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, config: config ?? {} }),
    }),
  );
}

// DELETE /api/admin/themes/{id} — theme устгах.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const badID = checkUUID(id);
  if (badID) return badID;
  const bad = checkOrigin(req);
  if (bad) return bad;
  return toClientResponse(await authedFetch(`/themes/${id}`, { method: 'DELETE' }));
}
