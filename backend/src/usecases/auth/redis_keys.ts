// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Auth domain-ийн ашигладаг Redis key-ийн угтварууд (prefix). Бичгийн алдаа
// бичигчийг түүний уншигчаас чимээгүйхэн салгахаас сэргийлэх, мөн энэ модулиас
// гадуурх адаптерууд (ялангуяа auth middleware) format-ыг дахин хэрэгжүүлэхийн
// оронд яг ижил нэрсийг дахин ашиглахын тулд төвлөрүүлсэн.

const prefixRefresh = 'refresh:';
const prefixUserOTP = 'user_otp:';
const prefixOTPAttempts = 'otp_attempts:';
const prefixLoginAttempts = 'login_attempts:';
const prefixForgotAttempts = 'forgot_attempts:';
const prefixResetRequest = 'pwd_reset_req:';
const prefixPasswordCutoff = 'pwd_cutoff:';
const prefixAccessDeny = 'access_deny:';

/** refreshKey нь refresh токены jti бичлэгүүдийг хүрээлдэг; байхгүй ⇒ хүчингүй болсон. */
export const refreshKey = (jti: string): string => `${prefixRefresh}${jti}`;

/** userOTPKey нь идэвхгүй бүртгэлийн амьд 6 оронтой OTP-г хадгална. */
export const userOTPKey = (email: string): string => `${prefixUserOTP}${email}`;

/**
 * resetRequestKey нь нууц үг сэргээх OTP-ийн GeregeCloud Verify request_id-г
 * email тус бүрд хадгална (resetPassword /check-д ашиглана).
 */
export const resetRequestKey = (email: string): string => `${prefixResetRequest}${email}`;

/** otpAttemptsKey нь email тус бүрийн амжилтгүй verifyOTP оролдлогуудыг тоолно. */
export const otpAttemptsKey = (email: string): string => `${prefixOTPAttempts}${email}`;

/**
 * loginAttemptsKey нь brute-force түгжих цонхонд зориулж email тус бүрийн
 * амжилтгүй login оролдлогуудыг тоолно.
 */
export const loginAttemptsKey = (email: string): string => `${prefixLoginAttempts}${email}`;

/** forgotAttemptsKey нь email тус бүрд /password/forgot-ийг rate-limit хийнэ. */
export const forgotAttemptsKey = (email: string): string => `${prefixForgotAttempts}${email}`;

/**
 * tokenCutoffKey нь энэ хэрэглэгчид олгогдсон аливаа access токеныг хүчингүй гэж
 * тооцох тасалбар цэгийг unix-секундээр хадгална. Auth middleware үүнийг
 * баталгаажсан хүсэлт бүр дээр уншдаг; changePassword болон resetPassword нь
 * үүнийг бичдэг.
 */
export const tokenCutoffKey = (userId: string): string => `${prefixPasswordCutoff}${userId}`;

/**
 * accessDenyKey нь logout хийсэн access токены jti-г токены үлдсэн амьдрах
 * хугацаагаар хадгална; байгаа ⇒ хүчингүй (auth middleware хүсэлт бүрд шалгана).
 */
export const accessDenyKey = (jti: string): string => `${prefixAccessDeny}${jti}`;

/**
 * googleLinkKey нь Google-ээр эхний удаа нэвтэрсэн хэрэглэгчийн eID-ээр
 * холбогдохыг хүлээж буй богино хугацааны токеныг (→ google_sub) хадгална.
 */
export const googleLinkKey = (token: string): string => `google_link:${token}`;

/**
 * superadminMFAKey нь MFA-тай super admin нэвтрэхэд (Google/eID амжилттай ч
 * session ХАРААХАН олгогдоогүй) үүсгэгддэг богино хугацааны токеныг (→ user_id)
 * хадгална. Токеныг TOTP/нөөц кодоор баталгаажуулсны дараа л session олгогдоно.
 */
export const superadminMFAKey = (token: string): string => `superadmin_mfa:${token}`;
