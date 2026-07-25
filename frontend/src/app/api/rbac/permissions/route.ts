import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/rbac/permissions — эрхийн каталог (RBAC matrix-ийн багана). roles.manage.
export async function GET() {
  return proxyResult(await authedFetch('/rbac/permissions', { method: 'GET' }));
}
