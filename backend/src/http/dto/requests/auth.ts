// Government Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Хүсэлтийн DTO схемүүд. Бүгд `strictObject` — танихгүй талбар татгалзагдана
// (Go хувилбарын DisallowUnknownFields-ийн эквивалент). JSON түлхүүрүүд Go
// хувилбартай ЯГ ижил тул клиент хөндөгдөхгүй.

import { z } from 'zod';

import { nonEmpty, strictObject, strongPassword } from '../../../pkg/validators/validators.js';

/**
 * eidStartSchema нь POST /auth/eid/start-ийн body. Бүх талбар сонголттой —
 * CROSS-DEVICE (desktop QR) урсгалд body огт байхгүй байж болно.
 *
 * callbackUrl (сонголт): SAME-DEVICE (утасны browser) үед frontend
 * <origin>/auth/eid/callback дамжуулна; хоосон/байхгүй бол CROSS-DEVICE.
 */
export const eidStartSchema = strictObject({
  callbackUrl: z.string().max(2048).optional(),
});
export type EidStartBody = z.infer<typeof eidStartSchema>;

/**
 * eidStartByNationalIdSchema нь POST /auth/eid/start-id-ийн body — иргэний
 * РД-аар нэвтрэлт эхлүүлж, бүртгэлтэй төхөөрөмж рүү push хийлгэнэ.
 */
export const eidStartByNationalIdSchema = strictObject({
  national_id: nonEmpty(64),
  callbackUrl: z.string().max(2048).optional(),
});
export type EidStartByNationalIdBody = z.infer<typeof eidStartByNationalIdSchema>;

/**
 * eidPollSchema нь POST /auth/eid/poll-ийн body — /eid/start-аас авсан
 * session_id-г IdP-д long-poll-оор асуухад дамжуулна.
 */
export const eidPollSchema = strictObject({
  session_id: nonEmpty(256),
  /**
   * google_link_token нь Google-ээр эхний удаа нэвтэрсэн хэрэглэгч eID-ээр
   * баталгаажуулж байгаа үед л ирнэ (сонголттой).
   */
  google_link_token: z.string().max(128).optional(),
});
export type EidPollBody = z.infer<typeof eidPollSchema>;

/**
 * googleLoginSchema нь POST /auth/google-ийн body — Google OAuth callback-ийн
 * code + redirect_uri.
 */
export const googleLoginSchema = strictObject({
  code: nonEmpty(2048),
  redirect_uri: nonEmpty(2048),
});
export type GoogleLoginBody = z.infer<typeof googleLoginSchema>;

/**
 * refreshSchema нь POST /auth/refresh-ийн body. `refresh_token` нь СОНГОЛТТОЙ:
 * cookie-д суурилсан SPA нь токеныг ЖС-д хадгалдаггүй тул handler нь httpOnly
 * `dgov_refresh` cookie-гоос уншина. Хоёулаа хоосон бол handler 400 өгнө.
 */
export const refreshSchema = strictObject({
  refresh_token: z.string().max(4096).optional(),
});
export type RefreshBody = z.infer<typeof refreshSchema>;

/**
 * logoutSchema нь POST /auth/logout-ийн body. access_token нь сонголттой —
 * өгвөл түүний jti deny-list-д орж access токен шууд хүчингүй болно.
 */
export const logoutSchema = strictObject({
  refresh_token: z.string().max(4096).optional(),
  access_token: z.string().max(4096).optional(),
});
export type LogoutBody = z.infer<typeof logoutSchema>;

/**
 * changePasswordSchema нь PUT /auth/password/change-ийн body. Шинэ нууц үгэд
 * Go хувилбарын `min=12,max=72,strongpassword` шалгуур хэвээр — bcrypt нь 72
 * байтаас хойшхыг үл тооцдог тул дээд хязгаар нь 72.
 */
export const changePasswordSchema = strictObject({
  current_password: z.string().min(1).max(72),
  new_password: strongPassword(12, 72),
});
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
