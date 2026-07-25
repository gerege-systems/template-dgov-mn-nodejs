import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/registry/services/{id}/publish — нийтлэх: шинэ хувилбар +
// baseline delta. Once-only зөрчилтэй атал once_only/proactive гэж зарласан
// бол backend 409 буцаана. registry.manage.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch(`/registry/services/${params.id}/publish`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
