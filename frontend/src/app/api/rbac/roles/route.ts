import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/rbac/roles — бүх role + permission (RBAC matrix). roles.manage эрх.
export async function GET() {
  return proxyResult(await authedFetch('/rbac/roles', { method: 'GET' }));
}

// POST /api/rbac/roles — шинэ role үүсгэх.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/rbac/roles', { method: 'POST', body: JSON.stringify(body) }));
}
