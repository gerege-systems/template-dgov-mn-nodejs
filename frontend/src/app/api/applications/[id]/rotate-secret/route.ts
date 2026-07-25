import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin, checkClientID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/applications/{id}/rotate-secret — client secret шинэчлэх (secret нэг удаа буцна).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkClientID(params.id);
  if (bad) return bad;
  return proxyResult(await authedFetch(`/applications/${params.id}/rotate-secret`, { method: 'POST' }));
}
