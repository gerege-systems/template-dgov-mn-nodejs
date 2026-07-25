import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/registry/evidences — нотолгооны каталог (ХУР mapping-тай). registry.view.
export async function GET() {
  return proxyResult(await authedFetch('/registry/evidences', { method: 'GET' }));
}

// POST /api/registry/evidences — нотолгоо бүртгэх. registry.manage.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch('/registry/evidences', { method: 'POST', body: JSON.stringify(body) }),
  );
}
