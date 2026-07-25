// Cookie тогтмолууд ба сонголтууд. BFF загварт токенуудыг httpOnly cookie-д
// хадгалдаг тул browser-ийн JS тэдгээрийг хэзээ ч уншихгүй (XSS-д тэсвэртэй).

export const ACCESS_COOKIE = 'dgov_access';
export const REFRESH_COOKIE = 'dgov_refresh';
// SSO-ээр нэвтэрсэн session-ий RP-initiated logout URL (id_token_hint-тэй).
// Гарах үед энэ байвал browser-ийг тийш чиглүүлж SSO дээр session-ийг дуусгана.
export const SSO_LOGOUT_COOKIE = 'dgov_sso_logout';

// Cookie-ийн насжилт. Backend-ийн анхдагч: JWT_EXPIRED=5 цаг, JWT_REFRESH_EXPIRED=7 хоног.
// Эдгээрийг backend-ийн тохиргоотой ойролцоо барина — хэтэрсэн access cookie-г
// refresh урсгал шинэчилнэ.
export const ACCESS_MAX_AGE = 60 * 60 * 5; // 5 цаг (секундээр)
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 хоног (секундээр)

/** Токен cookie-д хэрэглэх стандарт httpOnly сонголтууд. */
export function cookieOptions(maxAge: number) {
  // Fail-closed: COOKIE_SECURE заагаагүй бол production-д default-аар Secure
  // байна. Зөвхөн ил `'false'` өгсөн үед л Secure-гүй болно (жишээ нь дотоод
  // dev/http орчин). Ингэснээр env буруу бичигдсэн ч prod cookie ил гарахгүй.
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
