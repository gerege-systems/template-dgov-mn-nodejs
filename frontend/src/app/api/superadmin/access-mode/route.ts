import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/superadmin/access-mode — платформын хандалтын горим (public/private).
// Backend дээр RequireSuperAdmin-ээр хамгаалагдсан.
export async function GET() {
  return proxyResult(await authedFetch('/superadmin/access-mode', { method: 'GET' }));
}

// PUT /api/superadmin/access-mode — хандалтын горимыг солих ({ mode }).
export async function PUT(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/superadmin/access-mode', { method: 'PUT', body: JSON.stringify(body) }));
}
