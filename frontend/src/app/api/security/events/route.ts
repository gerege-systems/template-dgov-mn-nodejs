import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/security/events — RASP-style security event жагсаалт (admin-only).
// limit / offset query-г whitelist хийж backend руу дамжуулна.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();

  const limit = Number(url.searchParams.get('limit'));
  if (Number.isInteger(limit) && limit > 0) qs.set('limit', String(Math.min(limit, 200)));
  const offset = Number(url.searchParams.get('offset'));
  if (Number.isInteger(offset) && offset > 0) qs.set('offset', String(offset));

  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  return proxyResult(await authedFetch(`/security/events${suffix}`, { method: 'GET' }));
}
