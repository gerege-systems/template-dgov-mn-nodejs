import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/superadmin/admins/{id}/grant — байгаа хэрэглэгчид админ эрх олгох.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/superadmin/admins/${params.id}/grant`, { method: 'PUT' }));
}
