import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkClientID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// PUT /api/applications/{id}/services — application-д зөвшөөрөгдсөн gateway service-үүдийг тохируулах.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkClientID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch(`/applications/${params.id}/services`, { method: 'PUT', body: JSON.stringify(body) }));
}
