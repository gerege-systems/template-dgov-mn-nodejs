import { authedFetch } from '@/lib/api';
import { proxyResult, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/relay/requests/{id} — хүсэлтийн дэлгэрэнгүй (assignments + timeline).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/relay/requests/${params.id}`, { method: 'GET' }));
}
