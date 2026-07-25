import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api';
import { ACCESS_COOKIE, REFRESH_COOKIE, SSO_LOGOUT_COOKIE, ACCESS_MAX_AGE, REFRESH_MAX_AGE, cookieOptions } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

// Relative Location-оор redirect — nginx-ийн ард Next.js-ийн req.url нь дотоод
// хаягийг (0.0.0.0:3000) хардаг тул origin-д тулгуурлавал browser буруу хаяг руу
// очно. Relative зам ("/me/dashboard") нь browser-ийн нийтийн хаягаар шийдэгдэнэ.
function redirectTo(path: string, session?: { token: string; refresh: string; ssoLogoutRef?: string }): NextResponse {
  const res = new NextResponse(null, { status: 303, headers: { Location: path } });
  if (session) {
    res.cookies.set(ACCESS_COOKIE, session.token, cookieOptions(ACCESS_MAX_AGE));
    res.cookies.set(REFRESH_COOKIE, session.refresh, cookieOptions(REFRESH_MAX_AGE));
    // SSO logout ref (богино түлхүүр) — гарах үед энэ ref-ээр backend-ээс SSO
    // дээр session дуусгах logout URL-ийг авна (том header-ээс зайлсхийнэ).
    if (session.ssoLogoutRef) {
      res.cookies.set(SSO_LOGOUT_COOKIE, session.ssoLogoutRef, cookieOptions(REFRESH_MAX_AGE));
    }
  }
  return res;
}

// GET /sso/callback — dgov SSO-д бүртгэгдсэн redirect_uri. sso.dgov.mn
// нэвтрэлтийн дараа browser-ийг ?code&state-тэй энд буцаана. Backend /sso/callback
// нь state-ийг шалгаж, code-ийг токен болгож солин, иргэнийг upsert хийж JWT хос
// олгоно; токен хосыг httpOnly cookie-д суулгаад /me/dashboard руу шилжүүлнэ.
// Токен/refresh_token хэзээ ч browser JS-д хүрэхгүй.
export async function GET(req: Request) {
  const url = new URL(req.url);

  // Хэрэглэгч цуцалсан / SSO алдаа → нэвтрэх хуудас руу тайлбартай буцаана.
  if (url.searchParams.get('error')) {
    return redirectTo('/login?error=sso');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return redirectTo('/login?error=sso');
  }

  const r = await backendFetch<{ token?: string; refresh_token?: string; sso_logout_ref?: string }>('/sso/callback', {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });

  if (r.ok && r.data?.token && r.data?.refresh_token) {
    return redirectTo('/me/dashboard', { token: r.data.token, refresh: r.data.refresh_token, ssoLogoutRef: r.data.sso_logout_ref });
  }
  return redirectTo('/login?error=sso');
}
