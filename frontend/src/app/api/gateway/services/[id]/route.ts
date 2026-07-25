import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/gateway/services/{id} — service шинэчлэх.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch(`/gateway/services/${params.id}`, { method: 'PUT', body: JSON.stringify(body) }));
}

// DELETE /api/gateway/services/{id} — service устгах.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/gateway/services/${params.id}`, { method: 'DELETE' }));
}
