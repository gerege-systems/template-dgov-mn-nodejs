// eID based AI enabled Government Template Platform V3.0
// OIDC provider — consent request-ийн товчийг backend-ээс авна.
import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const challenge = new URL(req.url).searchParams.get('consent_challenge') ?? '';
  return proxyResult(
    await authedFetch(`/provider/consent?consent_challenge=${encodeURIComponent(challenge)}`, {
      method: 'GET',
    }),
  );
}
