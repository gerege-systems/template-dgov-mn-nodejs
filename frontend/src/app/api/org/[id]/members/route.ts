import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/org/{id}/members — байгууллагын гишүүдийн жагсаалт (гишүүн/админ).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/org/${params.id}/members`, { method: 'GET' }));
}

// POST /api/org/{id}/members — гишүүн нэмэх (owner/admin).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch(`/org/${params.id}/members`, { method: 'POST', body: JSON.stringify(body) }));
}
