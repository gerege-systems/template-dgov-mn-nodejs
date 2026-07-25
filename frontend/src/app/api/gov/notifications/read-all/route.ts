import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  return proxyResult(await authedFetch('/gov/notifications/read-all', { method: 'POST' }));
}
