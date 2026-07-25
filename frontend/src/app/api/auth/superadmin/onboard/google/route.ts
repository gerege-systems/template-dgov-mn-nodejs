import { backendFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// POST /api/auth/superadmin/onboard/google — онбординг эхний алхам. Wizard-аас
// ирсэн Google OAuth code-ийг backend руу дамжуулж onboard_token авна. redirect_uri
// нь онбординг google callback-тай ЯГ ижил байх ёстой тул энд server талд тооцно.
// email invite-д байхгүй бол backend 403 буцаана. Invite-gated тул НЭВТРЭЭГҮЙ.
export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;

  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  const { code } = await readJson<{ code?: string }>(req);
  const redirect_uri = `${origin}/api/auth/superadmin/onboard/google/callback`;

  return proxyResult(
    await backendFetch('/auth/superadmin/onboard/google', {
      method: 'POST',
      body: JSON.stringify({ code, redirect_uri }),
    }),
  );
}
