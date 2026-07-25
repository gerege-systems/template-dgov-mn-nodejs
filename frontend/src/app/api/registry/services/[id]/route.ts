import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/registry/services/{id} — паспорт, нотолгооны жагсаалттай нь. registry.view.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/registry/services/${params.id}`, { method: 'GET' }));
}

// PUT /api/registry/services/{id} — паспорт засах. registry.manage.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/registry/services/${params.id}`, { method: 'PUT', body: JSON.stringify(body) }),
  );
}

// DELETE /api/registry/services/{id} — устгах (зөвхөн ноорог). registry.manage.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/registry/services/${params.id}`, { method: 'DELETE' }));
}
