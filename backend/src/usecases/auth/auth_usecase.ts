// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/auth нь нэвтрэлт (eID · Google) болон session-ийн амьдралын мөчлөгийг
// (access + refresh токен) хариуцна.
//
// ХАМРАХ ХҮРЭЭ: "Login with eID" нь цорын ганц интерактив нэвтрэх арга тул нууц
// үг / OTP / бүртгэлийн урсгал БАЙХГҮЙ (Go хувилбарт эдгээрийн файл байгаа ч
// route-д холбогдоогүй үхмэл код тул порт хийгээгүй).
//
// Мөн энэ давхарга нь нэвтэрсэн иргэний eID ПРОФАЙЛ-ыг (төлөөлдөг байгууллага ·
// гарын үсэг зурагчид · PKI самбар) хариуцна — эдгээр нь eID client болон
// users-ийн хосолсон урсгал тул тусдаа usecase болгож салгаагүй (Go-той ижил).

import { ErrSSOTokenNotFound } from '../../domain/sso_token.js';
import type { User } from '../../domain/users.js';

export { ErrSSOTokenNotFound };
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { Representation, Signer, SignersResult } from '../../pkg/eid/eid_org.js';
import type {
  PersonActivity,
  PersonCertificates,
  PersonDevices,
  PersonSummary,
} from '../../pkg/eid/eid_pki.js';

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
/**
 * SSOTokenService нь хэрэглэгчийн хүчинтэй SSO access token-ыг (шаардвал refresh
 * хийж) буцаана. Хадгалагдсан токен байхгүй бол ErrSSOTokenNotFound шиднэ.
 * Хэрэгжүүлэлт нь `ssotoken` домэйнд.
 */
export interface SSOTokenService {
  validAccessToken(ctx: Ctx, userId: string): Promise<string>;
}

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

  // ── eID профайл: төлөөлдөг байгууллагууд ──

  /**
   * eidRepresentations нь хэрэглэгчийн төлөөлдөг байгууллагуудыг буцаана.
   * eID-ээр нэвтрээгүй (civil_id хоосон) бол АЛДААГҮЙГЭЭР хоосон жагсаалт —
   * профайлын хуудас Google хэрэглэгчид ч эвдрэхгүй.
   */
  eidRepresentations(ctx: Ctx, userId: string): Promise<Representation[]>;
  /**
   * registerEidOrganization нь регистрийн дугаараар улсын бүртгэлээс (XYP)
   * байгууллагыг хайж, иргэнийг eID дээр төлөөлөл болгон холбоно. Эрхийн
   * шалгалт нь eidmongolia талд — template нь зөвхөн эрх бүхий этгээдийн РД
   * жагсаалтыг дамжуулна.
   */
  registerEidOrganization(ctx: Ctx, userId: string, regNo: string): Promise<Representation[]>;
  /** unlinkEidOrganization нь өөрийн байгууллагын төлөөллийг цуцлана. */
  unlinkEidOrganization(ctx: Ctx, userId: string, orgRegister: string): Promise<Representation[]>;
  /** listEidOrgSigners нь байгууллагын гарын үсэг зурагчдыг буцаана. */
  listEidOrgSigners(ctx: Ctx, userId: string, orgRegister: string): Promise<Signer[]>;
  /** addEidOrgSigner нь өөр иргэнийг MANAGER эрхтэй зурагч болгож нэмнэ. */
  addEidOrgSigner(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    signerRegNo: string,
    role: string,
  ): Promise<SignersResult>;
  /** resendEidOrgSigner нь PENDING зурагч руу sign-push-ийг дахин илгээнэ. */
  resendEidOrgSigner(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    signerRegNo: string,
  ): Promise<SignersResult>;
  /** removeEidOrgSigner нь зурагчийг хасна. */
  removeEidOrgSigner(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    signerRegNo: string,
  ): Promise<Signer[]>;

  // ── eID профайл: иргэний PKI самбар ──
  //
  // SSO eID proxy тохируулагдсан бол эдгээр нь SSO-гоор дамжина (энэ RP-д
  // PKI_READ эрх шаардахгүй); эс бөгөөс шууд eidmongolia руу.

  eidSummary(ctx: Ctx, userId: string): Promise<PersonSummary | null>;
  eidCertificates(ctx: Ctx, userId: string): Promise<PersonCertificates | null>;
  eidDevices(ctx: Ctx, userId: string): Promise<PersonDevices | null>;
  eidActivity(
    ctx: Ctx,
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PersonActivity | null>;
}
