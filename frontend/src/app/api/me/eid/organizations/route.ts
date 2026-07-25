import { authedFetch } from '@/lib/api';
import { proxyResult, readJson, checkOrigin } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/me/eid/organizations — нэвтэрсэн eID хэрэглэгчийн төлөөлдөг
// байгууллагууд (eidmongolia.mn representations). backend /users/me/eid/
// organizations руу проксилно.
export async function GET() {
  return proxyResult(await authedFetch('/users/me/eid/organizations', { method: 'GET' }));
}

// POST /api/me/eid/organizations — регистрийн дугаараар (XYP) байгууллага холбоно.
// backend нь улсын бүртгэлээс баталгаажуулж eidmongolia-д төлөөлөл нэмнэ.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(await authedFetch('/users/me/eid/organizations', { method: 'POST', body: JSON.stringify(body) }));
}
