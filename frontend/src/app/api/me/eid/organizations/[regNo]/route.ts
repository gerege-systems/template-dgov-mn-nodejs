import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// DELETE /api/me/eid/organizations/{regNo} — нэвтэрсэн иргэн өөрийн байгууллагын
// төлөөллөө (eidmongolia representation) цуцлана.
export async function DELETE(req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  return proxyResult(
    await authedFetch(`/users/me/eid/organizations/${encodeURIComponent(params.regNo)}`, { method: 'DELETE' }),
  );
}
