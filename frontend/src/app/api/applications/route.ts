import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/applications — OAuth2 client-үүд (Applications).
export async function GET() {
  return proxyResult(await authedFetch('/applications', { method: 'GET' }));
}

// POST /api/applications — шинэ application үүсгэх (secret нэг удаа буцна).
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/applications', { method: 'POST', body: JSON.stringify(body) }));
}
