import { NextResponse } from 'next/server';
import { getIntegration, isConfigured, buildAuthorizeURL, appOrigin } from '@/lib/integrations';
import { cookieOptions } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

// GET /api/integrations/:provider/connect
// OAuth урсгалыг эхлүүлнэ: тухайн провайдерын authorize endpoint рүү
// client_id + redirect_uri + state-тэйгээр 302 redirect хийнэ. State-ийг
// callback дээр CSRF-ийн эсрэг тулгахаар богино настай httpOnly cookie-д
// хадгална. Client ID env тохируулаагүй бол integrations хуудас руу
// not_configured алдаатай буцаана (OAuth арматур бэлэн, secret нэмэхэд ажиллана).
export async function GET(req: Request, props: { params: Promise<{ provider: string }> }) {
  const params = await props.params;
  const provider = getIntegration(params.provider);
  const origin = appOrigin(req);

  if (!provider) {
    return NextResponse.redirect(`${origin}/me/integrations?error=unknown_provider`);
  }
  if (!isConfigured(provider)) {
    return NextResponse.redirect(`${origin}/me/integrations?error=not_configured&provider=${provider.id}`);
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthorizeURL(provider, origin, state));
  // Токен cookie-той ижил fail-closed Secure бодлого (cookieOptions) —
  // COOKIE_SECURE заагаагүй production-д Secure-гүй гарахаас сэргийлнэ.
  res.cookies.set(`oauth_state_${provider.id}`, state, cookieOptions(600)); // 10 минут — OAuth round-trip-д хүрэлцэхүйц
  return res;
}
