import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/relay/requests/{id}/forward — хүсэлтийг дээд (upstream) platform руу
// webhook-оор дамжуулна. relay.manage.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const params = await props.params;
  const badID = checkUUID(params.id);
  if (badID) return badID;
  const body = await readJson(req);
  return proxyResult(await authedFetch(`/relay/requests/${params.id}/forward`, { method: 'POST', body: JSON.stringify(body) }));
}
