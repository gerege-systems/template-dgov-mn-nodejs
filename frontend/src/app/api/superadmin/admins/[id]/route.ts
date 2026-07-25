import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// DELETE /api/superadmin/admins/{id} — админ эрхийг хасах (энгийн хэрэглэгч болгох).
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/superadmin/admins/${params.id}`, { method: 'DELETE' }));
}
