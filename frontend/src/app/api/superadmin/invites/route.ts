import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/superadmin/invites — superadmin онбординг урилгын жагсаалт
// (pending/accepted). Backend дээр RequireSuperAdmin-ээр хамгаалагдсан.
export async function GET() {
  return proxyResult(await authedFetch('/superadmin/invites', { method: 'GET' }));
}

// POST /api/superadmin/invites — шинэ и-мэйл урих (онбординг зөвшөөрөх).
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch('/superadmin/invites', { method: 'POST', body: JSON.stringify(body) }),
  );
}
