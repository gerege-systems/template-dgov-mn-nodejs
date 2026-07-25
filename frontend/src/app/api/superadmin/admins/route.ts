import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/superadmin/admins — админ түвшний бүртгэлүүд (super admin + admin).
// Backend дээр RequireSuperAdmin-ээр хамгаалагдсан.
export async function GET() {
  return proxyResult(await authedFetch('/superadmin/admins', { method: 'GET' }));
}

// POST /api/superadmin/admins — шинэ админ үүсгэх.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/superadmin/admins', { method: 'POST', body: JSON.stringify(body) }));
}
