import { authedFetch } from '@/lib/api';
import { toClientResponse, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/admin/themes/{id}/active — тухайн theme-ийг идэвхтэй (default) болгох.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const badID = checkUUID(id);
  if (badID) return badID;
  const bad = checkOrigin(req);
  if (bad) return bad;
  return toClientResponse(await authedFetch(`/themes/${id}/active`, { method: 'PUT' }));
}
