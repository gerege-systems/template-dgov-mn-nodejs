import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkIntID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/rbac/roles/{id}/permissions — role-ийн permission-уудыг бүхэлд нь солих.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkIntID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/rbac/roles/${params.id}/permissions`, { method: 'PUT', body: JSON.stringify(body) }),
  );
}
