import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/me/eid/devices — eID PKI самбар (backend /users/me/eid/devices руу прокси).
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  return proxyResult(await authedFetch(`/users/me/eid/devices${qs}`, { method: 'GET' }));
}
