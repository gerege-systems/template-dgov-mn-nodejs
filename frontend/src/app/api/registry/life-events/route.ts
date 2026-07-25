import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/registry/life-events — амьдралын/бизнесийн үйл явдал. registry.view.
export async function GET() {
  return proxyResult(await authedFetch('/registry/life-events', { method: 'GET' }));
}

// POST /api/registry/life-events — үйл явдал үүсгэх. registry.manage.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await authedFetch('/registry/life-events', { method: 'POST', body: JSON.stringify(body) }),
  );
}
