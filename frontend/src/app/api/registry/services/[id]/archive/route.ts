import { authedFetch } from '@/lib/api';
import { proxyResult, checkOrigin, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/registry/services/{id}/archive — архивлах. Нийтлэгдсэн паспортыг
// устгах боломжгүй тул хэрэглэхээ больсныг ингэж тэмдэглэнэ. registry.manage.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkOrigin(req) ?? checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(
    await authedFetch(`/registry/services/${params.id}/archive`, { method: 'POST' }),
  );
}
