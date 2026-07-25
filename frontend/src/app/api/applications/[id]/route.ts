import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkClientID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/applications/{id} — нэг application.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkClientID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/applications/${params.id}`, { method: 'GET' }));
}

// PUT /api/applications/{id} — application шинэчлэх.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkClientID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch(`/applications/${params.id}`, { method: 'PUT', body: JSON.stringify(body) }));
}

// DELETE /api/applications/{id} — application устгах (OAuth client-ыг устгана).
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkClientID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/applications/${params.id}`, { method: 'DELETE' }));
}
