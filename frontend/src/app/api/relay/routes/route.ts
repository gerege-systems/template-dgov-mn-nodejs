import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/relay/routes — чиглүүлэлтийн дүрмүүд. relay.view.
export async function GET() {
  return proxyResult(await authedFetch('/relay/routes', { method: 'GET' }));
}

// POST /api/relay/routes — чиглүүлэлт үүсгэх. relay.manage.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/relay/routes', { method: 'POST', body: JSON.stringify(body) }));
}
