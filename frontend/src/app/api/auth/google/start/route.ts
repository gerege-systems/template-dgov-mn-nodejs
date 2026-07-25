import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cookieOptions } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

// GET /api/auth/google/start — Google OAuth consent руу redirect. CSRF-ээс
// хамгаалахын тулд санамсаргүй state үүсгэж httpOnly cookie-д хадгална;
// callback дээр тулгана. client_id нь нууц биш (GOOGLE_CLIENT_ID env);
// client_secret зөвхөн backend талд.
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  if (!clientId) {
    return NextResponse.redirect(`${origin}/login?gerror=google_disabled`);
  }

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set('g_oauth_state', state, { ...cookieOptions(600), maxAge: 600 }); // 10 мин
  // SSO provider урсгал (/oauth/login) энд next-ээр буцах хаягаа дамжуулна —
  // callback дараа нь тэр рүү (эсвэл glink eID алхмаар дамжуулан) буцна.
  const next = new URL(req.url).searchParams.get('next');
  if (next && next.startsWith('/')) {
    jar.set('g_oauth_next', next, { ...cookieOptions(600), maxAge: 600 });
  } else {
    jar.delete('g_oauth_next');
  }

  const redirectUri = `${origin}/api/auth/google/callback`;
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
