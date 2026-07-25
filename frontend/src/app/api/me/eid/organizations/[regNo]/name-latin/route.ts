import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/me/eid/organizations/{regNo}/name-latin — байгууллагын латин нэрийг засна (ADMIN).
export async function PUT(req: Request, props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/me/org-name-latin/${encodeURIComponent(params.regNo)}`, { method: 'PUT', body: JSON.stringify(body) }),
  );
}
