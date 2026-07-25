import 'server-only';
import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE, REFRESH_COOKIE,
  ACCESS_MAX_AGE, REFRESH_MAX_AGE, cookieOptions,
} from './cookies';

// Серверийн талд токен cookie-г унших / бичих / цэвэрлэх туслахууд.
// Зөвхөн route handler болон server component-аас дуудагдана.
// Next 15-д cookies() нь Promise буцаадаг тул бүгд async.

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/** Нэвтрэлт / refresh-ийн дараа токен хосыг cookie-д суулгана. */
export async function setSession(accessToken: string, refreshToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_MAX_AGE));
  jar.set(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_MAX_AGE));
}

/** Зөвхөн access токенг шинэчилнэ (refresh урсгалын дараа). */
export async function setAccessToken(accessToken: string): Promise<void> {
  (await cookies()).set(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_MAX_AGE));
}

/** Гарах үед хоёр cookie-г устгана. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Refresh токен байгаа эсэх — "нэвтэрсэн" гэж тооцох durable сигнал. */
export async function hasSession(): Promise<boolean> {
  return !!(await getRefreshToken());
}

/**
 * Cookie бичих боломжтой контекст мөн үү (route handler / server action),
 * эсвэл RSC render үү. Backend refresh нь токеныг ROTATE хийдэг (хуучин
 * refresh jti шууд хэрэглэгддэг) тул шинэ хосыг хадгалж ЧАДАХГҮЙ контекстод
 * refresh дуудах нь хүчинтэй сессиэ шатаах алдаа болно — урьдчилж шалгана.
 * Probe нь одоо байгаа refresh cookie-г ижил утгаар нь дахин бичих тул
 * route handler-т ямар ч нөлөөгүй; RSC-д synchronous throw хийдэг.
 */
export async function canPersistSession(): Promise<boolean> {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return false;
  try {
    jar.set(REFRESH_COOKIE, refresh, cookieOptions(REFRESH_MAX_AGE));
    return true;
  } catch {
    return false;
  }
}
