import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/admin/users — хэрэглэгчдийн жагсаалт. Query параметрүүдийг
// whitelist хийж цэвэр хэлбэрээр backend руу дамжуулна (transparent
// proxy-гоор дурын query нэвтрүүлэхгүй). users.manage эрхээр хамгаалагдсан
// (backend дээр).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();

  const offset = Number(url.searchParams.get('offset'));
  const limit = Number(url.searchParams.get('limit'));
  if (Number.isInteger(offset) && offset > 0) qs.set('offset', String(offset));
  if (Number.isInteger(limit) && limit > 0) qs.set('limit', String(Math.min(limit, 200)));

  const role = url.searchParams.get('role');
  if (role && /^\d{1,10}$/.test(role)) qs.set('role', role);
  const active = url.searchParams.get('active');
  if (active === 'true' || active === 'false') qs.set('active', active);

  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  return proxyResult(await authedFetch(`/admin/users${suffix}`, { method: 'GET' }));
}

// POST /api/admin/users — иргэнийг регистрээр урьдчилан бүртгэх (хаалттай
// горимд нэвтрэх боломжтой болгоно). role_id: 2=админ, 3=менежер, 4=хэрэглэгч
// (заахгүй бол хэрэглэгч). Backend дээр users.manage эрхээр хамгаалагдсан.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/admin/users', { method: 'POST', body: JSON.stringify(body) }));
}
