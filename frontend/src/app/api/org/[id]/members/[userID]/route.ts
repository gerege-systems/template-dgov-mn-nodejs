import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/org/{id}/members/{userID} — гишүүний дүр солих (owner/admin).
export async function PUT(req: Request, props: { params: Promise<{ id: string; userID: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id) ?? checkUUID(params.userID);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/org/${params.id}/members/${params.userID}`, { method: 'PUT', body: JSON.stringify(body) }),
  );
}

// DELETE /api/org/{id}/members/{userID} — гишүүн хасах (owner хамгаалагдсан).
export async function DELETE(req: Request, props: { params: Promise<{ id: string; userID: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id) ?? checkUUID(params.userID);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/org/${params.id}/members/${params.userID}`, { method: 'DELETE' }));
}
