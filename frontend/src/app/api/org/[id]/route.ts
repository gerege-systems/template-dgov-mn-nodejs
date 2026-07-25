import { authedFetch } from '@/lib/api';
import { proxyResult, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/org/{id} — байгууллагын мэдээлэл (зөвхөн гишүүн/админ).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/org/${params.id}`, { method: 'GET' }));
}
