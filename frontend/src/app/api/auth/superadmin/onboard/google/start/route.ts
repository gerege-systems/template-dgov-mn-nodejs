import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cookieOptions } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

// GET /api/auth/superadmin/onboard/google/start — онбординг Google OAuth consent
// руу redirect. Ердийн нэвтрэлтийн start-тай ижил боловч тусдаа state cookie
// (sa_onboard_state) + онбординг callback руу буцна. Callback нь ТҮҮХИЙ code-ийг
// wizard руу дамжуулна (wizard onboard/google руу POST хийж onboard_token авна).
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  if (!clientId) {
    return NextResponse.redirect(`${origin}/superadmin/onboard?gerror=google_disabled`);
  }

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set('sa_onboard_state', state, { ...cookieOptions(600), maxAge: 600 }); // 10 мин

  const redirectUri = `${origin}/api/auth/superadmin/onboard/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
