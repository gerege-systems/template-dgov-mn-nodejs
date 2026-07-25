// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/auth нь нэвтрэлт (eID · Google) болон session-ийн амьдралын мөчлөгийг
// (access + refresh токен) хариуцна.
//
// ХАМРАХ ХҮРЭЭ: "Login with eID" нь цорын ганц интерактив нэвтрэх арга тул нууц
// үг / OTP / бүртгэлийн урсгал БАЙХГҮЙ (Go хувилбарт эдгээрийн файл байгаа ч
// route-д холбогдоогүй үхмэл код тул порт хийгээгүй). Байгууллагын төлөөлөл
// (representations / signers) болон иргэний PKI самбар нь `org` ба `eidprofile`
// домэйнтэй хамт нэмэгдэнэ.

import type { User } from '../../domain/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/** LoginResult нь нэвтрэлт амжилттай болсны дараах session-ийн бүрдэл. */
export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * EIDStartResponse нь /eid/start-ийн үр дүн — клиент үүгээр QR/deep-link харуулж,
 * /eid/poll руу sessionId-г дамжуулна.
 */
export interface EIDStartResponse {
  sessionId: string;
  deviceLinkUrl: string;
  verificationCode: string;
  expiresAt: string;
}

export interface EIDPollRequest {
  sessionId: string;
  /**
   * googleLinkToken нь Google-ээр эхний удаа нэвтэрсэн хэрэглэгч eID-ээр
   * баталгаажуулж байгаа үед л ирнэ — COMPLETE болоход тухайн Google account-ийг
   * энэ eID хэрэглэгчид холбоно. Хоосон бол зүгээр eID нэвтрэлт.
   */
  googleLinkToken: string;
}

/**
 * EIDPollResponse нь /eid/poll-ийн үр дүн. state нь IdP-ийн session төлөв
 * (RUNNING / COMPLETE / EXPIRED / REFUSED). COMPLETE үед user + токенууд дүүрэн.
 *
 * COMPLETE + mfaRequired=true (зөвхөн super admin-д) бол eID баталгаажсан ч
 * session ОЛГОГДООГҮЙ: клиент mfaToken-оор /auth/superadmin/mfa-г дуудна. Энэ үед
 * user/токенууд хоосон.
 */
export interface EIDPollResponse {
  state: string;
  user: User | null;
  /** mfaRequired нь super admin-ийн 2FA шат шаардагдаж буйг илэрхийлнэ. */
  mfaRequired: boolean;
  /** mfaToken нь /auth/superadmin/mfa-д дамжуулах богино хугацааны (5 мин) токен. */
  mfaToken: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * GoogleLoginResponse нь Google callback-ийн үр дүн. linked=true бол шууд
 * нэвтэрсэн; false бол эхний удаа тул eID-ээр баталгаажуулах шаардлагатай
 * (linkToken-ийг eID poll руу дамжуулна).
 */
export interface GoogleLoginResponse {
  linked: boolean;
  login: LoginResult | null;
  mfaRequired: boolean;
  mfaToken: string;
  linkToken: string;
  email: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
  /**
   * accessToken нь сонголттой — өгвөл jti-г нь deny-list-д нэмж access токеныг
   * хугацаа дуусахаас өмнө шууд хүчингүй болгоно.
   */
  accessToken: string;
}

/** AuthUsecase нь HTTP handler-ийн харьцдаг оролтын хил (input boundary) юм. */
export interface AuthUsecase {
  /**
   * eidStart нь eID device-link нэвтрэлтийг IdP дээр эхлүүлнэ. callbackUrl хоосон
   * бол CROSS-DEVICE (desktop QR — browser өөрөө poll хийнэ); хоосон биш бол
   * SAME-DEVICE (mobile browser App2App — approve-ийн дараа browser буцна).
   */
  eidStart(ctx: Ctx, callbackUrl: string): Promise<EIDStartResponse>;
  /**
   * eidStartByNationalId нь иргэний РД-аар нэвтрэлтийг эхлүүлж, тухайн РД-тэй
   * холбоотой төхөөрөмж рүү баталгаажуулах push хийлгэнэ. device_link
   * шаардлагагүй; дуусгахдаа QR урсгалтай ижил eidPoll ашиглана.
   */
  eidStartByNationalId(
    ctx: Ctx,
    nationalId: string,
    callbackUrl: string,
  ): Promise<EIDStartResponse>;
  /**
   * eidPoll нь session-ийн төлвийг long-poll-оор асууна. COMPLETE болоход
   * IdP-ийн identity-аар хэрэглэгчийг upsert хийж, токен хос олгож буцаана.
   */
  eidPoll(ctx: Ctx, req: EIDPollRequest): Promise<EIDPollResponse>;
  /**
   * googleLogin нь Google authorization code-ийг боловсруулна: холбогдсон account
   * бол шууд нэвтрүүлж, эс бол eID-ээр баталгаажуулах linkToken буцаана.
   */
  googleLogin(ctx: Ctx, code: string, redirectUri: string): Promise<GoogleLoginResponse>;
  /** unlinkGoogleFromUser нь нэвтэрсэн хэрэглэгчийн Google холболтыг арилгана. */
  unlinkGoogleFromUser(ctx: Ctx, userId: string): Promise<void>;
  /** refresh нь refresh токеныг ЭРГҮҮЛНЭ: шинэ хос үүсгэж, хуучин jti-г хүчингүй болгоно. */
  refresh(ctx: Ctx, req: RefreshRequest): Promise<LoginResult>;
  /** logout нь refresh токены jti-г устгаж, (өгвөл) access токеныг deny-list-д нэмнэ. */
  logout(ctx: Ctx, req: LogoutRequest): Promise<void>;
}
