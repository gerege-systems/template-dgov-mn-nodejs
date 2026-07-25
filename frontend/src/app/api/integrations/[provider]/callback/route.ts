import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIntegration, exchangeCodeForToken, appOrigin } from '@/lib/integrations';
import { authedFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/integrations/:provider/callback?code=...&state=...
// OAuth-ийн буцах цэг. State-ийг connect дээр тавьсан cookie-той тулгаж CSRF-ээс
// сэргийлээд, authorization code-ийг access/refresh токен болгон солилцоод,
// токеныг хэрэглэгчийн session-тэйгээр Go backend руу (шифрлэн хадгалуулахаар)
// илгээнэ — токен browser-т хэзээ ч хадгалагдахгүй.
export async function GET(req: Request, props: { params: Promise<{ provider: string }> }) {
  const params = await props.params;
  const provider = getIntegration(params.provider);
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const back = (q: string) => NextResponse.redirect(`${origin}/me/integrations?${q}`);

  if (!provider) {
    return back('error=unknown_provider');
  }

  // Провайдер OAuth-г цуцалбал error параметр буцаадаг.
  if (url.searchParams.get('error')) {
    return back(`error=denied&provider=${provider.id}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const jar = await cookies();
  const expected = jar.get(`oauth_state_${provider.id}`)?.value;

  if (!code || !state || !expected || state !== expected) {
    return back(`error=invalid_state&provider=${provider.id}`);
  }

  // Authorization code → access/refresh токен.
  let token;
  try {
    token = await exchangeCodeForToken(provider, origin, code);
  } catch {
    const fail = back(`error=exchange_failed&provider=${provider.id}`);
    fail.cookies.delete(`oauth_state_${provider.id}`);
    return fail;
  }

  // Токеныг backend-д (хэрэглэгчийн session-тэйгээр) шифрлэн хадгалуулна.
  const stored = await authedFetch('/integrations', {
    method: 'POST',
    body: JSON.stringify({
      provider: provider.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? '',
      expires_at_ms: token.expires_at ?? 0,
    }),
  });

  const res = back(stored.ok ? `connected=${provider.id}` : `error=store_failed&provider=${provider.id}`);
  res.cookies.delete(`oauth_state_${provider.id}`);
  return res;
}
