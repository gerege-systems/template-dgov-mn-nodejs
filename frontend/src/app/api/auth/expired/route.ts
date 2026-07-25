import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, SSO_LOGOUT_COOKIE } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

// GET /api/auth/expired — сесси хүчингүй болсон (refresh токен дууссан эсвэл
// rotation-д хэрэглэгдсэн) үед хамгаалагдсан RSC (AreaShell)-с чиглүүлдэг
// цэвэрлэх цэг. RSC cookie устгаж чаддаггүй тул үхсэн cookie энд цэвэрлэгдэж,
// /login руу буцаана. Ингэснээр middleware refresh cookie-г "нэвтэрсэн" гэж
// андуурч /login-г эргүүлэн буцаах хязгааргүй давталт (ERR_TOO_MANY_REDIRECTS)
// таслагдана. Backend дуудлагагүй, зөвхөн локал cookie устгах идемпотент GET
// тул CSRF шаардлагагүй.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next'));

  // Relative Location — nginx-ийн ард req.url нь Next-ийн дотоод HOSTNAME
  // (0.0.0.0:3000)-г агуулдаг тул абсолют URL үүсгэвэл browser холбогдож
  // чадахгүй хаяг руу чиглэнэ. Харьцангуй зам ашиглаж жинхэнэ origin-г хадгална.
  const loc = `/login?next=${encodeURIComponent(next)}&notice=expired`;
  const res = new NextResponse(null, { status: 307, headers: { Location: loc } });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(SSO_LOGOUT_COOKIE);
  return res;
}
