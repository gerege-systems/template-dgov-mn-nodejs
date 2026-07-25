import { authedFetch } from '@/lib/api';
import { proxyResult, checkUUID } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/registry/services/{id}/once-only — тухайн үйлчилгээний once-only
// шалгалт: иргэнээс шаардсан баримт, тэдгээрээс ХУР-д байгаа нь, хүрч болох
// проактив байдлын дээд шат. registry.view.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const bad = checkUUID(params.id);
  if (bad) return bad;
  return proxyResult(
    await authedFetch(`/registry/services/${params.id}/once-only`, { method: 'GET' }),
  );
}
