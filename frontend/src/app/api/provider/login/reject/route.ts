// eID based AI enabled Government Template Platform V3.0
// OIDC provider — login-ыг цуцлах (RP руу access_denied-ээр буцна).
import { authedFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson<{ login_challenge?: string; reason?: string }>(req);
  return proxyResult(
    await authedFetch('/provider/login/reject', { method: 'POST', body: JSON.stringify(body) }),
  );
}
