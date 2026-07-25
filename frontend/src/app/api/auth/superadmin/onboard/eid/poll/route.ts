import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/onboard/eid/poll — онбординг eID төлөв шалгах.
// COMPLETE үед энд токен ҮҮСЭХГҮЙ (онбординг totp алхмаар дуусна) тул {state, step}-г
// шууд дамжуулна. Invite-gated тул НЭВТРЭЭГҮЙ.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await backendFetch('/auth/superadmin/onboard/eid/poll', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
