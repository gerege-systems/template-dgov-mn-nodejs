import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/relay/requests — хүсэлтүүдийн жагсаалт. relay.view.
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  return proxyResult(await authedFetch(`/relay/requests${qs}`, { method: 'GET' }));
}

// POST /api/relay/requests — гараар хүсэлт ingest хийх (scaffold). relay.manage.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/relay/requests', { method: 'POST', body: JSON.stringify(body) }));
}
