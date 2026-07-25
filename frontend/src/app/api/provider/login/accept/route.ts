// eID based AI enabled Government Template Platform V3.0
// OIDC provider (dan = SSO) — login challenge-ыг backend руу прокси (session-тэй).
import { authedFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson<{ login_challenge?: string }>(req);
  return proxyResult(
    await authedFetch('/provider/login/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}
