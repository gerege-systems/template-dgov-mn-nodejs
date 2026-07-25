import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkClientID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/applications/{id}/secret — client secret-ыг гараар оноох.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkClientID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch(`/applications/${params.id}/secret`, { method: 'PUT', body: JSON.stringify(body) }));
}
