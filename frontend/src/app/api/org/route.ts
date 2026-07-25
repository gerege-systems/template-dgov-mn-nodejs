import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/org — нэвтэрсэн хэрэглэгчийн харьяа байгууллагуудын жагсаалт.
export async function GET() {
  return proxyResult(await authedFetch('/org', { method: 'GET' }));
}

// POST /api/org — шинэ байгууллага үүсгэх (үүсгэгч нь owner болно).
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/org', { method: 'POST', body: JSON.stringify(body) }));
}
