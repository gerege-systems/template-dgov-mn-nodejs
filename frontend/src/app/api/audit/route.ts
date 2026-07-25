import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/audit — hash-chained audit log жагсаалт. Query параметрүүдийг
// whitelist хийж backend руу дамжуулна (action / actor / limit / offset).
// Backend дээр admin-only хамгаалагдсан; BFF зөвхөн session cookie-г дамжуулна.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();

  const action = url.searchParams.get('action');
  if (action) qs.set('action', action);
  const actor = url.searchParams.get('actor');
  if (actor) qs.set('actor', actor);

  const limit = Number(url.searchParams.get('limit'));
  if (Number.isInteger(limit) && limit > 0) qs.set('limit', String(Math.min(limit, 200)));
  const offset = Number(url.searchParams.get('offset'));
  if (Number.isInteger(offset) && offset > 0) qs.set('offset', String(offset));

  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  return proxyResult(await authedFetch(`/audit${suffix}`, { method: 'GET' }));
}
