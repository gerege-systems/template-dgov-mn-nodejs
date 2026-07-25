// eID based AI enabled Government Template Platform V3.0
import { authedFetch } from '@/lib/api';
import { checkOrigin, proxyResult, readJson } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const body = await readJson<{ consent_challenge?: string; grant_scope?: string[] }>(req);
  return proxyResult(
    await authedFetch('/provider/consent/accept', { method: 'POST', body: JSON.stringify(body) }),
  );
}
