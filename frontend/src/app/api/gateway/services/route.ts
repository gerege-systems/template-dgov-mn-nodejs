import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/gateway/services — upstream service-үүд.
export async function GET() {
  return proxyResult(await authedFetch('/gateway/services', { method: 'GET' }));
}

// POST /api/gateway/services — шинэ service үүсгэх.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/gateway/services', { method: 'POST', body: JSON.stringify(body) }));
}
