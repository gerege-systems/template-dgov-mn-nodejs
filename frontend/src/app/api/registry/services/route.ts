import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// Backend-ийн хүлээн авдаг шүүлтүүрүүд — зөвхөн эдгээрийг дамжуулна.
const ALLOWED_FILTERS = ['status', 'authority', 'life_event_id', 'proactivity', 'q'] as const;

// GET /api/registry/services — паспортын жагсаалт (ноорог орно). registry.view.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  for (const key of ALLOWED_FILTERS) {
    const val = url.searchParams.get(key);
    if (val) qs.set(key, val);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  return proxyResult(await authedFetch(`/registry/services${suffix}`, { method: 'GET' }));
}

// POST /api/registry/services — паспорт үүсгэх (ноорог). registry.manage.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch('/registry/services', { method: 'POST', body: JSON.stringify(body) }),
  );
}
