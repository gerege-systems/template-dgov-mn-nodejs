import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/auth/superadmin/onboard/google/callback — онбординг Google OAuth-ийн
// хүлээн авагч. state-ийг cookie-той тулгаж (CSRF), ТҮҮХИЙ code-ийг wizard руу
// (?code=) буцаана. Токен exchange-г wizard onboard/google POST дээр backend хийнэ
// (redirect_uri энэ callback-тай ижил байх ёстой тул тэнд мөн ижлээр тооцно).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = (await cookies()).get('sa_onboard_state')?.value;
  (await cookies()).delete('sa_onboard_state');

  if (url.searchParams.get('error') || !code) {
    return NextResponse.redirect(`${origin}/superadmin/onboard?gerror=google_cancelled`);
  }
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${origin}/superadmin/onboard?gerror=state_mismatch`);
  }

  return NextResponse.redirect(`${origin}/superadmin/onboard?code=${encodeURIComponent(code)}`);
}
