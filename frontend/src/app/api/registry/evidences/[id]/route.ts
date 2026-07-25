import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/registry/evidences/{id} — нотолгоо засах. ХУР-д боломжтой болгож
// тэмдэглэх нь once-only зөрчлийг засах гол үйлдэл. registry.manage.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/registry/evidences/${params.id}`, { method: 'PUT', body: JSON.stringify(body) }),
  );
}

// DELETE /api/registry/evidences/{id} — нотолгоо устгах. registry.manage.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/registry/evidences/${params.id}`, { method: 'DELETE' }));
}
