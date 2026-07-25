import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/me/latin-name — хэрэглэгчийн латин нэрийг (first_name_en/last_name_en) засна.
export async function PUT(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/me/latin-name', { method: 'PUT', body: JSON.stringify(body) }));
}
