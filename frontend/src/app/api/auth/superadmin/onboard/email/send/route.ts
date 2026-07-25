import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/onboard/email/send — онбординг и-мэйл баталгаажуулах
// код илгээх. Invite-gated тул НЭВТРЭЭГҮЙ (onboard_token-оор).
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson(req);
  return proxyResult(
    await backendFetch('/auth/superadmin/onboard/email/send', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
