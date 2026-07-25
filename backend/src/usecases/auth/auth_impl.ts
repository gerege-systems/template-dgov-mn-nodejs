// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { randomBytes } from 'node:crypto';

import {
  asDomainError,
  badRequest,
  DomainError,
  ErrorType,
  forbidden,
  internalCause,
  notFound,
  unauthorized,
} from '../../apperror/index.js';
import { isCacheMiss, type RedisCache } from '../../datasources/caches/redis.js';
import {
  changePassword as domainChangePassword,
  ErrEmptyPassword,
  isAdmin,
  isSuperAdmin,
  newEIDUser,
  verifyPassword,
  type GoogleAccount,
  type User,
} from '../../domain/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { ErrInitiateRejected, StateComplete, type EidClient } from '../../pkg/eid/eid.js';
import {
  ErrNotRepresentative,
  ErrSignerNotEnrolled,
  type Representation,
  type Signer,
  type SignersResult,
} from '../../pkg/eid/eid_org.js';
import { ErrPKINotPermitted } from '../../pkg/eid/eid_pki.js';
import type {
  PersonActivity,
  PersonCertificates,
  PersonDevices,
  PersonSummary,
} from '../../pkg/eid/eid_pki.js';
import {
  ErrSSOProxyDisabled,
  ErrSSOTokenExpired,
  type SSOEidProxy,
} from '../../pkg/ssoeidproxy/ssoeidproxy.js';
import {
  ErrXypNotConfigured,
  ErrXypNotFound,
  type Lookuper,
  type Organization,
} from '../../pkg/xyp/xyp.js';
import type { GoogleClient, GoogleUser } from '../../pkg/google/google.js';
import type { JWTService, TokenPair } from '../../pkg/jwt/jwt.js';
import * as logger from '../../pkg/logger/logger.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import {
  accessDenyKey,
  googleLinkKey,
  refreshKey,
  superadminMFAKey,
  tokenCutoffKey,
} from './redis_keys.js';
import { ErrSSOTokenNotFound } from './auth_usecase.js';
import type {
  AuthUsecase,
  SSOTokenService,
  ChangePasswordRequest,
  EIDPollRequest,
  EIDPollResponse,
  EIDStartResponse,
  GoogleLoginResponse,
  LoginResult,
  LogoutRequest,
  RefreshRequest,
} from './auth_usecase.js';

/**
 * AuthConfig нь auth use case-д шаардлагатай тохиргооны хэсэг. Үүнийг inject
 * хийснээр энэ модуль config-оос ямар нэг хамааралгүй хэвээр үлддэг —
 * composition root нь env тохиргоог auth domain-ийн анхаардаг хэлбэр рүү
 * хувиргадаг.
 */
export interface AuthConfig {
  /** eidDisplayText нь IdP/гар утсан дээр харагдах RP-ийн нэр/тайлбар. */
  eidDisplayText: string;
  /**
   * ssoEidProxy + ssoTokens нь PKI самбарыг SSO-гоор унших СОНГОЛТТОЙ зам.
   * ХОЁУЛАА өгөгдсөн (SSO_EID_PROXY_BASE_URL тохируулсан) үед PKI GET-үүд
   * шууд eidmongolia-ий оронд SSO proxy-гоор дамжина — энэ RP-д PKI_READ эрх
   * шаардахгүй болно. null бол шууд зам.
   */
  ssoEidProxy?: SSOEidProxy | null;
  ssoTokens?: SSOTokenService | null;
  /**
   * bcryptCost нь нууц үг солих үед domain.changePassword руу дамжуулах
   * ажлын хүчин чадал. 0 (эсвэл заагаагүй) бол domain-ийн анхдагчийг авна.
   */
  bcryptCost?: number;
}

// Тэмдэглэл: eID-ийн callback URL нь ТОХИРГООНООС биш, ХҮСЭЛТЭЭС ирдэг —
// frontend өөрийн origin-оо (<origin>/auth/eid/callback) дамжуулдаг тул
// same-device болон cross-device урсгалыг нэг л endpoint-оор зохицуулна. IdP нь
// уг URL-ийг allowlist-ээрээ шалгана (EID_CALLBACK_URL env нь IdP-д бүртгүүлэх
// утгыг баримтжуулах зорилготой).

/**
 * eidPollTimeoutMs нь IdP-ийн session long-poll-ийн хүлээх дээд хугацаа (мс). eid
 * client-ийн HTTP timeout (30с) үүнээс УРТ тул сүлжээ дуусахаас өмнө IdP хариу
 * буцаах зайтай.
 */
const eidPollTimeoutMs = 25_000;

/** googleLinkTTL нь Google→eID холбохыг хүлээх токены амьдрах хугацаа. */
const googleLinkTTLSeconds = 15 * 60;

/**
 * superadminMFATTL нь MFA код оруулахыг хүлээж буй токены амьдрах хугацаа —
 * богино (5 мин) байх нь хулгайлагдсан токены ашиглах цонхыг нарийсгана.
 */
const superadminMFATTLSeconds = 5 * 60;

/**
 * tokenCutoffTTLSeconds нь тасалбар (cutoff) дохионы амьдрах хугацаа. Access
 * токенууд хамгийн ихдээ JWT_EXPIRED цагийн дараа дуусдаг тул 24ц нь дамжиж буй
 * аливаа access токеноос тав тухтай удаан амьдардаг. Refresh токены хүчингүй
 * болголт нь DB-д (users.password_changed_at) байрладаг бөгөөд энэ TTL-д
 * хамаарахгүй.
 */
const tokenCutoffTTLSeconds = 24 * 60 * 60;

const usecaseName = 'auth';
const fileName = 'auth_impl.ts';

/** randomLinkToken нь 32 hex тэмдэгтийн (16 байт) crypto-random токен үүсгэнэ. */
function randomLinkToken(): string {
  return randomBytes(16).toString('hex');
}

/** googleAccountOf нь Google профайлыг холбоход хадгалах domain хэлбэрт буулгана. */
function googleAccountOf(gu: GoogleUser): GoogleAccount {
  return {
    sub: gu.sub,
    email: gu.email,
    emailVerified: gu.emailVerified,
    name: gu.name,
    picture: gu.picture,
  };
}

/**
 * requiresMFA нь тухайн хэрэглэгчид MFA gate хэрэгтэй эсэхийг шийднэ: super admin
 * БҮР MFA дамжина (тэдний MFA бүртгэл superadmin_accounts satellite-д байдаг тул
 * users.mfa_enabled уншихгүй). Энгийн хэрэглэгч/админы нэвтрэлт огт өөрчлөгдөхгүй.
 */
const requiresMFA = (user: User): boolean => isSuperAdmin(user);

/**
 * mapInitiateErr нь eID initiate-ийн алдааг HTTP статус руу буулгана: IdP-ийн 4xx
 * (РД олдсонгүй / scope / формат) бол цэвэр BadRequest (clientMsg), бусад (сүлжээ
 * / 5xx) бол дотоод 5xx алдаа.
 */
function mapInitiateErr(err: unknown, clientMsg: string): DomainError {
  if (err instanceof ErrInitiateRejected) return badRequest(clientMsg);
  return internalCause(new Error(`eid initiate: ${logger.errText(err)}`));
}

class AuthUsecaseImpl implements AuthUsecase {
  constructor(
    private readonly users: UsersUsecase,
    private readonly jwtService: JWTService,
    private readonly eid: EidClient,
    private readonly xyp: Lookuper | null,
    private readonly google: GoogleClient | null,
    private readonly redisCache: RedisCache,
    private readonly cfg: AuthConfig,
  ) {}

  // ───────────────────────────── Session helpers ─────────────────────────────

  /**
   * rememberRefresh нь refresh jti-г refresh токены exp-тэй тохирох TTL-тэйгээр
   * Redis-д хадгална. /refresh болон /logout нь эндхийн БАЙХГҮЙ байдлыг
   * "хүчингүй болсон" гэж үздэг бөгөөд энэ нь access токены хар жагсаалтгүйгээр
   * logout хэрхэн ажилладгийн учир юм.
   */
  private async rememberRefresh(ctx: Ctx, pair: TokenPair): Promise<void> {
    const ttlSeconds = Math.floor((pair.refresh_expires_at.getTime() - Date.now()) / 1000);
    if (ttlSeconds <= 0) throw new Error('refresh token already expired');
    // Тодорхой TTL-ээр бичнэ — refresh токен бүр өөрийн amьдрах хугацаатай.
    await this.redisCache.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, ttlSeconds);
  }

  /**
   * mintSession нь хэрэглэгчид access+refresh токен хос үүсгэж, refresh-ийг
   * Redis-д тэмдэглэнэ (eID poll болон Google нэвтрэлт хуваалцдаг).
   */
  private async mintSession(ctx: Ctx, user: User): Promise<TokenPair> {
    const pair = this.jwtService.generateTokenPair(user.id, isAdmin(user), user.roleId, user.email);
    await this.rememberRefresh(ctx, pair);
    return pair;
  }

  /**
   * startSuperadminMFA нь MFA-тай super admin-д session олгохын ӨМНӨ богино
   * хугацааны mfa_token үүсгэж Redis-д (→ user_id) хадгална.
   *
   * Redis алдаа гарвал FAIL-CLOSED: токен хадгалагдаагүй бол баталгаажуулалт
   * боломжгүй тул нэвтрэлтийг АМЖИЛТГҮЙ болгоно — MFA-г алгасаж session олгох нь
   * энэ функцийн зорилгыг бүрмөсөн үгүйсгэнэ.
   */
  private async startSuperadminMFA(ctx: Ctx, userId: string): Promise<string> {
    const token = randomLinkToken();
    try {
      await this.redisCache.setTTL(ctx, superadminMFAKey(token), userId, superadminMFATTLSeconds);
    } catch (err) {
      throw internalCause(new Error(`store mfa token: ${logger.errText(err)}`));
    }
    return token;
  }

  // ─────────────────────────────────── eID ───────────────────────────────────

  async eidStart(ctx: Ctx, callbackUrl: string): Promise<EIDStartResponse> {
    logger.infoWithContext(ctx, 'Upper eidStart', {
      usecase: usecaseName,
      method: 'eidStart',
      file: fileName,
    });

    // callbackUrl хоосон (CROSS-DEVICE, desktop QR): eID backend утас руу callback
    // дамжуулахгүй, desktop browser QR-аа уншуулаад /eid/poll-оор нэвтэрнэ.
    // Хоосон биш (SAME-DEVICE, mobile browser App2App): утас approve хийсний дараа
    // browser-ийг callback руу буцаана.
    let start;
    try {
      start = await this.eid.qrInitiate(this.cfg.eidDisplayText, callbackUrl, ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'eidStart failed: initiate error', {
        usecase: usecaseName,
        method: 'eidStart',
        file: fileName,
        step: 'eid_qr_initiate',
        error: logger.errText(err),
      });
      throw mapInitiateErr(err, 'eID session эхлүүлэх боломжгүй байна');
    }

    return {
      sessionId: start.sessionId,
      deviceLinkUrl: start.deviceLinkUrl,
      verificationCode: start.verificationCode,
      expiresAt: start.expiresAt,
    };
  }

  async eidStartByNationalId(
    ctx: Ctx,
    nationalId: string,
    callbackUrl: string,
  ): Promise<EIDStartResponse> {
    // РД-г лог-д БИЧИХГҮЙ (хувийн мэдээлэл) — зөвхөн утга байгаа эсэхийг тэмдэглэнэ.
    logger.infoWithContext(ctx, 'Upper eidStartByNationalId', {
      usecase: usecaseName,
      method: 'eidStartByNationalId',
      file: fileName,
      request: { has_national_id: nationalId !== '' },
    });

    const trimmed = nationalId.trim();
    if (trimmed === '') throw badRequest('national_id is required');

    let start;
    try {
      start = await this.eid.initiate(trimmed, this.cfg.eidDisplayText, callbackUrl, ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'eidStartByNationalId failed: initiate error', {
        usecase: usecaseName,
        method: 'eidStartByNationalId',
        file: fileName,
        step: 'eid_initiate',
        error: logger.errText(err),
      });
      throw mapInitiateErr(err, 'Регистрийн дугаар олдсонгүй эсвэл буруу байна');
    }

    // Push урсгалд device_link шаардлагагүй тул орхино.
    return {
      sessionId: start.sessionId,
      deviceLinkUrl: '',
      verificationCode: start.verificationCode,
      expiresAt: start.expiresAt,
    };
  }

  async eidPoll(ctx: Ctx, req: EIDPollRequest): Promise<EIDPollResponse> {
    logger.infoWithContext(ctx, 'Upper eidPoll', {
      usecase: usecaseName,
      method: 'eidPoll',
      file: fileName,
      request: { has_session_id: req.sessionId !== '' },
    });

    if (req.sessionId === '') throw badRequest('session_id is required');

    let sess;
    try {
      sess = await this.eid.session(req.sessionId, eidPollTimeoutMs, ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'eidPoll failed: session error', {
        usecase: usecaseName,
        method: 'eidPoll',
        file: fileName,
        step: 'eid_session',
        error: logger.errText(err),
      });
      throw internalCause(new Error(`eid session: ${logger.errText(err)}`));
    }

    // Terminal биш (RUNNING) болон terminal-fail (EXPIRED/REFUSED) үед зөвхөн
    // төлвийг буцаана — клиент дахин асуух эсвэл мессеж харуулна.
    if (sess.state !== StateComplete) return emptyPoll(sess.state);

    // Subject нь хэрэглэгчийн давтагдашгүй түлхүүр. Public RP (энэ template)-д IdP
    // нь national_id-г илчлэхгүй, зөвхөн civil_id өгдөг тул civil_id-г түлхүүр
    // болгоно; эрх бүхий RP-ийн ховор тохиолдолд national_id руу fallback хийнэ.
    // РД/civil_id-г лог-д БИЧИХГҮЙ — зөвхөн identity байгаа эсэхийг тэмдэглэнэ.
    const id = sess.identity;
    const subject = id ? id.civilId || id.nationalId : '';
    if (subject === '' || !id) {
      logger.errorWithContext(ctx, 'eidPoll failed: complete without identity', {
        usecase: usecaseName,
        method: 'eidPoll',
        file: fileName,
        step: 'check_identity',
        has_identity: id !== null,
      });
      throw internalCause(new Error('eid complete without identity'));
    }

    // АНХААР: IdP нь TLS-ээр хамгаалагдсан, эрх бүхий эх сурвалж тул COMPLETE
    // хариунд итгэнэ. Түлхүүр болгож subject (civil_id, эс бөгөөс national_id).
    let newUser: User;
    try {
      newUser = newEIDUser(
        subject,
        id.givenName,
        id.surname,
        id.givenNameEn,
        id.surnameEn,
        id.nationalId,
        id.kycLevel,
      );
    } catch (err) {
      logger.errorWithContext(ctx, 'eidPoll failed: build user error', {
        usecase: usecaseName,
        method: 'eidPoll',
        file: fileName,
        step: 'domain_new_eid_user',
        error: logger.errText(err),
      });
      throw internalCause(new Error(`build eid user: ${logger.errText(err)}`));
    }

    // login COMPLETE-ийн cert.value-ээс задалсан сертификатын дэлгэрэнгүйг
    // (+ documentNumber) хэрэглэгчид хадгална — Profile хуудсанд харуулна.
    newUser.documentNumber = id.documentNumber;
    if (id.certificate) {
      newUser.certSerial = id.certificate.serial;
      newUser.certNotBefore = id.certificate.notBefore;
      newUser.certNotAfter = id.certificate.notAfter;
      newUser.certIssuer = id.certificate.issuer;
      newUser.certKeyType = id.certificate.keyType;
    }

    const upserted = await this.users.upsertFromEID(ctx, { user: newUser });
    const user = upserted.user;

    // Google-ээр эхний удаа нэвтэрч, eID-ээр баталгаажуулж байгаа бол тухайн
    // Google account-ийг энэ бодит хүнд холбоно (non-fatal).
    await this.linkGoogleIfPending(ctx, user.id, req.googleLinkToken);

    // MFA-тай super admin бол ЭНД session олгохгүй — eID баталгаажсан ч эхлээд
    // TOTP/нөөц код шаардана. Энгийн хэрэглэгчийн eID нэвтрэлт огт өөрчлөгдөхгүй.
    if (requiresMFA(user)) {
      const mfaToken = await this.startSuperadminMFA(ctx, user.id);
      return { ...emptyPoll(StateComplete), mfaRequired: true, mfaToken };
    }

    let pair: TokenPair;
    try {
      pair = await this.mintSession(ctx, user);
    } catch (err) {
      logger.errorWithContext(ctx, 'eidPoll failed: session mint error', {
        usecase: usecaseName,
        method: 'eidPoll',
        file: fileName,
        step: 'mint_session',
        error: logger.errText(err),
        user_id: user.id,
      });
      throw internalCause(new Error(`mint session: ${logger.errText(err)}`));
    }

    return {
      state: StateComplete,
      user,
      mfaRequired: false,
      mfaToken: '',
      accessToken: pair.access_token,
      refreshToken: pair.refresh_token,
    };
  }

  // ───────────────────────────────── Google ─────────────────────────────────

  async googleLogin(ctx: Ctx, code: string, redirectUri: string): Promise<GoogleLoginResponse> {
    if (!this.google?.configured()) {
      throw internalCause(new Error('google login not configured'));
    }

    let gu: GoogleUser;
    try {
      gu = await this.google.exchange(code, redirectUri, ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'googleLogin failed: token exchange', {
        usecase: usecaseName,
        method: 'googleLogin',
        file: fileName,
        error: logger.errText(err),
      });
      throw badRequest('Google нэвтрэлт амжилтгүй боллоо');
    }

    // Аль хэдийн холбогдсон Google account уу?
    let user: User | null = null;
    try {
      user = await this.users.getByGoogleSub(ctx, gu.sub);
    } catch (lookErr) {
      const dom = asDomainError(lookErr);
      // ЗӨВХӨН "олдсонгүй" үед эхний-удаа урсгал руу шилжинэ; бусад (DB г.м.)
      // алдааг дамжуулна — эс бөгөөс дэд бүтцийн доголдол "шинэ хэрэглэгч" мэт
      // харагдаж, чимээгүй холболт үүсгэх эрсдэлтэй.
      if (!dom || dom.type !== ErrorType.NotFound) throw lookErr;
    }

    if (user) {
      // Профайлыг (нэр/зураг/и-мэйл) хамгийн сүүлийн Google утгаар шинэчилнэ
      // (best-effort — нэвтрэлтийг тасалдуулахгүй).
      try {
        await this.users.linkGoogleAccount(ctx, user.id, googleAccountOf(gu));
      } catch (err) {
        logger.errorWithContext(ctx, 'google profile refresh failed (non-fatal)', {
          usecase: usecaseName,
          method: 'googleLogin',
          file: fileName,
          error: logger.errText(err),
        });
      }

      // MFA-тай super admin бол ЭНД session олгохгүй — эхлээд TOTP/нөөц код.
      if (requiresMFA(user)) {
        const mfaToken = await this.startSuperadminMFA(ctx, user.id);
        return {
          linked: true,
          login: null,
          mfaRequired: true,
          mfaToken,
          linkToken: '',
          email: user.email,
        };
      }

      let pair: TokenPair;
      try {
        pair = await this.mintSession(ctx, user);
      } catch (err) {
        throw internalCause(new Error(`mint session: ${logger.errText(err)}`));
      }
      return {
        linked: true,
        login: { user, accessToken: pair.access_token, refreshToken: pair.refresh_token },
        mfaRequired: false,
        mfaToken: '',
        linkToken: '',
        email: user.email,
      };
    }

    // Эхний удаа — eID-ээр баталгаажуулах linkToken үүсгэнэ. Google профайлыг
    // БҮТНЭЭР (JSON) Redis-д хадгална — eID COMPLETE болоход хэрэглэгчид
    // холбохдоо email/нэр/зураг зэргийг бүгдийг хадгалахад ашиглана.
    const token = randomLinkToken();
    try {
      await this.redisCache.setTTL(
        ctx,
        googleLinkKey(token),
        JSON.stringify(gu),
        googleLinkTTLSeconds,
      );
    } catch (err) {
      throw internalCause(new Error(`store link token: ${logger.errText(err)}`));
    }

    return {
      linked: false,
      login: null,
      mfaRequired: false,
      mfaToken: '',
      linkToken: token,
      email: gu.email,
    };
  }

  async unlinkGoogleFromUser(ctx: Ctx, userId: string): Promise<void> {
    await this.users.unlinkGoogle(ctx, userId);
  }

  /**
   * changePassword нь баталгаажсан хэрэглэгчийн нууц үгийг одоогийнхыг нь
   * шалгасны дараа солино. Шинэ passwordChangedAt нь хүчингүй болгох тасалбар
   * цэг болж ажилладаг — түүнээс өмнө олгогдсон refresh токенууд /refresh дээр
   * татгалзагдана; access токенуудыг мөн Redis дэх cutoff-оор хаана.
   */
  async changePassword(ctx: Ctx, req: ChangePasswordRequest): Promise<void> {
    const { userId, currentPassword, newPassword } = req;
    const method = 'changePassword';

    if (newPassword === '') {
      throw badRequest('new password is required');
    }

    const { user } = await this.users.getById(ctx, { id: userId });

    if (!(await verifyPassword(user, currentPassword))) {
      logger.errorWithContext(ctx, 'Change password failed: invalid current password', {
        usecase: usecaseName,
        method,
        file: fileName,
        step: 'verify_current_password',
        user_id: userId,
      });
      throw unauthorized('current password is incorrect');
    }

    try {
      await domainChangePassword(user, newPassword, this.cfg.bcryptCost ?? 0);
    } catch (err) {
      if (err === ErrEmptyPassword) throw badRequest(ErrEmptyPassword.message);
      throw internalCause(new Error(`hash new password: ${logger.errText(err)}`));
    }

    await this.users.updatePassword(ctx, { user });

    if (user.passwordChangedAt) {
      await this.recordTokenCutoff(ctx, userId, user.passwordChangedAt);
    }
  }

  /**
   * recordTokenCutoff нь тухайн хэрэглэгчид олгогдсон access токенуудыг "энэ
   * агшнаас өмнөх бол хүчингүй" гэж тэмдэглэнэ (auth middleware уншина). Redis
   * алдаа NON-FATAL — нууц үг аль хэдийн солигдсон бөгөөд refresh нь DB дэх
   * passwordChangedAt-аар давхар хамгаалагдсан.
   */
  private async recordTokenCutoff(ctx: Ctx, userId: string, when: Date): Promise<void> {
    try {
      await this.redisCache.setTTL(
        ctx,
        tokenCutoffKey(userId),
        String(Math.floor(when.getTime() / 1000)),
        tokenCutoffTTLSeconds,
      );
    } catch (err) {
      logger.errorWithContext(ctx, 'auth: failed to write token cutoff (non-fatal)', {
        usecase: usecaseName,
        method: 'recordTokenCutoff',
        file: fileName,
        step: 'redis_set_token_cutoff',
        error: logger.errText(err),
        user_id: userId,
      });
    }
  }

  /**
   * linkGoogleIfPending нь eidPoll COMPLETE болоход дуудагдана: googleLinkToken
   * байвал тухайн Google account-ийг (Redis-ээс GetDel-ээр авч) энэ eID
   * хэрэглэгчид холбоно.
   *
   * Холболтын алдаа NON-FATAL — eID нэвтрэлт үргэлж амжилттай (жишээ нь Google
   * account өөр хүнд аль хэдийн холбогдсон бол зөвхөн логдоно).
   */
  private async linkGoogleIfPending(ctx: Ctx, userId: string, linkToken: string): Promise<void> {
    if (linkToken === '') return;

    let raw: string;
    try {
      raw = await this.redisCache.getDel(ctx, googleLinkKey(linkToken));
    } catch (err) {
      logger.errorWithContext(ctx, 'google link token invalid/expired (non-fatal)', {
        usecase: usecaseName,
        method: 'linkGoogleIfPending',
        has_error: !isCacheMiss(err),
      });
      return;
    }
    if (raw === '') return;

    let gu: GoogleUser;
    try {
      gu = JSON.parse(raw) as GoogleUser;
    } catch {
      logger.errorWithContext(ctx, 'google link payload invalid (non-fatal)', {
        usecase: usecaseName,
        method: 'linkGoogleIfPending',
        has_error: true,
      });
      return;
    }
    if (!gu.sub) {
      logger.errorWithContext(ctx, 'google link payload invalid (non-fatal)', {
        usecase: usecaseName,
        method: 'linkGoogleIfPending',
        has_error: true,
      });
      return;
    }

    try {
      await this.users.linkGoogleAccount(ctx, userId, googleAccountOf(gu));
    } catch (err) {
      logger.errorWithContext(ctx, 'google link failed (non-fatal)', {
        usecase: usecaseName,
        method: 'linkGoogleIfPending',
        error: logger.errText(err),
        user_id: userId,
      });
    }
  }

  // ─────────────────────────── Session lifecycle ───────────────────────────

  /**
   * refresh нь refresh токеныг ЭРГҮҮЛНЭ. Токеныг дахин тоглуулах (replay) нь
   * амжилтгүй болдог, учир нь хуучин jti-г эхэнд нь GetDel-ээр АТОМААР
   * уншиж-устгадаг. Энэ нь TOCTOU-гийн цоорхойг хаана: ижил токентой зэрэгцээ
   * хоёр хүсэлт ирвэл зөвхөн НЭГ нь jti-г амжид хэрэглэж чадах тул нэг л шинэ
   * session үүснэ.
   */
  async refresh(ctx: Ctx, req: RefreshRequest): Promise<LoginResult> {
    logger.infoWithContext(ctx, 'Upper refresh', {
      usecase: usecaseName,
      method: 'refresh',
      file: fileName,
      request: { has_refresh_token: req.refreshToken !== '' },
    });

    let claims;
    try {
      claims = this.jwtService.parseRefreshToken(req.refreshToken);
    } catch (err) {
      logger.errorWithContext(ctx, 'refresh failed: invalid token', {
        usecase: usecaseName,
        method: 'refresh',
        file: fileName,
        step: 'parse_refresh_token',
        error: logger.errText(err),
      });
      throw unauthorized('invalid refresh token');
    }

    // jti нь сервер талд одоо ч амьд эсэхийг шалгаад тэр дороо ХЭРЭГЛЭНЭ
    // (single-use). GetDel нь атомаар уншиж-устгадаг тул зэрэгцээ хоёр хүсэлт
    // ижил токеныг хэрэглэж чадахгүй. Logout / өмнөх эргэлт мөн энэ jti-г
    // устгасан байх ёстой.
    let consumed = '';
    try {
      consumed = await this.redisCache.getDel(ctx, refreshKey(claims.jti));
    } catch (err) {
      logger.errorWithContext(ctx, 'refresh failed: token revoked', {
        usecase: usecaseName,
        method: 'refresh',
        file: fileName,
        step: 'consume_jti',
        error: isCacheMiss(err) ? 'token already used or not found' : logger.errText(err),
        jti: claims.jti,
      });
      throw unauthorized('refresh token has been revoked');
    }
    if (consumed === '') throw unauthorized('refresh token has been revoked');

    // Хүчингүй болгосон / идэвхгүйжүүлсэн бүртгэлүүд refresh нь амьд байсан ч
    // шинэ access токен авахаа болихын тулд identity-г шинээр хайна. Токенд
    // хадгалагдсан тогтвортой userId-аар хайна — email-ээр НЭ хайна: eID
    // хэрэглэгчид email = NULL тул GetByEmail хэзээ ч олдохгүй.
    let user: User;
    try {
      user = (await this.users.getById(ctx, { id: claims.UserID })).user;
    } catch (err) {
      logger.errorWithContext(ctx, 'refresh failed: user lookup error', {
        usecase: usecaseName,
        method: 'refresh',
        file: fileName,
        step: 'get_user_by_id',
        error: logger.errText(err),
        user_id: claims.UserID,
      });
      throw unauthorized('user no longer exists');
    }

    if (!user.active) {
      logger.errorWithContext(ctx, 'refresh failed: account not activated', {
        usecase: usecaseName,
        method: 'refresh',
        file: fileName,
        step: 'check_active',
        user_id: user.id,
      });
      throw forbidden('account is not activated');
    }

    // Хамгийн сүүлийн credential эргүүлэхээс ӨМНӨ (эсвэл яг тэр секундэд)
    // олгогдсон токенуудыг татгалз. JWT iat нь секунд хүртэл бутархайгүй
    // болгогддог тул нэг секундэд олгогдсон токеныг алгасахгүйн тулд
    // "After биш" (issued <= cutoff) семантик ашиглана.
    const cutoff = user.passwordChangedAt;
    if (cutoff && claims.iat !== 0 && claims.iat <= Math.floor(cutoff.getTime() / 1000)) {
      logger.errorWithContext(ctx, 'refresh failed: token issued before credential rotation', {
        usecase: usecaseName,
        method: 'refresh',
        file: fileName,
        step: 'check_revocation_cutoff',
        user_id: user.id,
      });
      throw unauthorized('refresh token has been revoked');
    }

    // Эргүүлэх: хуучин jti-г аль хэдийн дээр GetDel-ээр устгасан тул энд зөвхөн
    // шинэ хосыг бүртгэнэ.
    let pair: TokenPair;
    try {
      pair = await this.mintSession(ctx, user);
    } catch (err) {
      logger.errorWithContext(ctx, 'refresh failed: session mint error', {
        usecase: usecaseName,
        method: 'refresh',
        file: fileName,
        step: 'mint_session',
        error: logger.errText(err),
        user_id: user.id,
      });
      throw internalCause(new Error(`mint session: ${logger.errText(err)}`));
    }

    return { user, accessToken: pair.access_token, refreshToken: pair.refresh_token };
  }

  /**
   * logout нь refresh токены jti-г устгаснаар дахин ашиглах боломжгүй болгоно.
   * accessToken өгөгдсөн бол түүний jti-г токены үлдсэн амьдрах хугацаагаар
   * deny-list-д нэмдэг тул access токен ч шууд хүчингүй болно (auth middleware
   * хүсэлт бүрд шалгадаг).
   */
  async logout(ctx: Ctx, req: LogoutRequest): Promise<void> {
    logger.infoWithContext(ctx, 'Upper logout', {
      usecase: usecaseName,
      method: 'logout',
      file: fileName,
      request: { has_refresh_token: req.refreshToken !== '' },
    });

    let claims;
    try {
      claims = this.jwtService.parseRefreshToken(req.refreshToken);
    } catch (err) {
      logger.errorWithContext(ctx, 'logout failed: invalid token', {
        usecase: usecaseName,
        method: 'logout',
        file: fileName,
        step: 'parse_refresh_token',
        error: logger.errText(err),
      });
      throw unauthorized('invalid refresh token');
    }

    try {
      await this.redisCache.del(ctx, refreshKey(claims.jti));
    } catch (err) {
      logger.errorWithContext(ctx, 'logout failed: redis del error', {
        usecase: usecaseName,
        method: 'logout',
        file: fileName,
        step: 'redis_del',
        error: logger.errText(err),
        jti: claims.jti,
      });
      throw internalCause(new Error(`revoke refresh: ${logger.errText(err)}`));
    }

    await this.denyAccessToken(ctx, req.accessToken);
  }

  /**
   * denyAccessToken нь access токены jti-г үлдсэн амьдрах хугацаагаар deny-list-д
   * нэмнэ. BEST-EFFORT: токен хоосон / задлагдахгүй / аль хэдийн дууссан бол
   * чимээгүй алгасна (logout-ийн үр дүнд нөлөөлөхгүй — refresh revoke нь гол
   * ажиллагаа).
   */
  private async denyAccessToken(ctx: Ctx, accessToken: string): Promise<void> {
    if (accessToken === '') return;

    let claims;
    try {
      claims = this.jwtService.parseToken(accessToken);
    } catch {
      return;
    }
    if (claims.jti === '' || claims.exp === 0) return;

    const ttlSeconds = claims.exp - Math.floor(Date.now() / 1000);
    if (ttlSeconds <= 0) return;

    try {
      await this.redisCache.setTTL(ctx, accessDenyKey(claims.jti), '1', ttlSeconds);
    } catch (err) {
      logger.errorWithContext(ctx, 'logout: failed to deny access token (non-fatal)', {
        step: 'redis_set_access_deny',
        error: logger.errText(err),
      });
    }
  }

  // ─────────────────────── eID профайл: туслахууд ───────────────────────

  /**
   * eidPersonEtsi нь userId-аар хэрэглэгчийг олж, ETSI танигч (PNOMN-<CIVIL>,
   * ТОМООР) буцаана. eID хэрэглэгч БИШ (civil_id хоосон) бол хоосон мөр —
   * АЛДАА БИШ, дуудагч өөрөө шийднэ.
   */
  private async eidPersonEtsi(ctx: Ctx, userId: string): Promise<string> {
    const got = await this.users.getById(ctx, { id: userId });
    const civilId = got.user.civilId.trim();
    if (civilId === '') return '';
    return `PNOMN-${civilId.toUpperCase()}`;
  }

  /**
   * actingEtsi нь eID-ээр нэвтэрсэн БАЙХЫГ шаардана — байгууллагын үйлдлүүд
   * иргэний eID-д холбогдсон эрхэн дээр тулгуурладаг.
   */
  private async actingEtsi(ctx: Ctx, userId: string): Promise<string> {
    const etsi = await this.eidPersonEtsi(ctx, userId);
    if (etsi === '') throw forbidden('Энэ үйлдэлд eID-ээр нэвтэрсэн байх шаардлагатай');
    return etsi;
  }

  /**
   * eidProxyEnabled нь PKI-г SSO-гоор дамжуулах зам идэвхтэй эсэхийг хэлнэ.
   * ХОЁУЛАА (proxy + токен үйлчилгээ) байх ёстой — эс бөгөөс токенгүй proxy
   * дуудлага бүр 401 болно.
   */
  private eidProxyEnabled(): boolean {
    const { ssoEidProxy, ssoTokens } = this.cfg;
    return (
      ssoEidProxy !== undefined &&
      ssoEidProxy !== null &&
      ssoTokens !== undefined &&
      ssoTokens !== null
    );
  }

  /**
   * ssoProxyAccessToken нь хэрэглэгчийн хүчинтэй SSO access token-ыг авна.
   * Токен байхгүй бол ДАХИН НЭВТРЭХ (401) төлөв — 500 биш.
   */
  private async ssoProxyAccessToken(ctx: Ctx, userId: string): Promise<string> {
    const tokens = this.cfg.ssoTokens;
    if (tokens === undefined || tokens === null) {
      throw new DomainError(ErrorType.Internal, 'eID үйлчилгээ түр боломжгүй байна');
    }
    try {
      return await tokens.validAccessToken(ctx, userId);
    } catch (err) {
      if (err instanceof ErrSSOTokenNotFound) {
        throw unauthorized('eID мэдээлэл авахын тулд SSO-гоор дахин нэвтэрнэ үү');
      }
      throw internalCause(err);
    }
  }

  /**
   * mapSignerErr нь eID signer client-ийн алдаануудыг apperror болгоно. Эрхийн
   * шийдвэр IdP-д үлдэж, энд зөвхөн HTTP статус руу буулгана.
   */
  private mapSignerErr(err: unknown): Error {
    if (err instanceof ErrNotRepresentative) {
      return forbidden('Та энэ байгууллагын гарын үсэг зурагчдыг удирдах эрхгүй байна');
    }
    if (err instanceof ErrSignerNotEnrolled) {
      return notFound('Энэ регистрийн дугаартай иргэн eID-д бүртгэлгүй байна');
    }
    return internalCause(err);
  }

  /**
   * mapPKIErr нь PKI дуудлагын алдааг HTTP-д буулгана: PKI_READ эрхгүй бол
   * Forbidden (frontend "эрх хүлээгдэж байна" харуулна), SSO токен хүчингүй
   * бол 401, proxy унтраалттай бол 500.
   */
  private mapPKIErr(err: unknown): Error {
    if (err instanceof ErrPKINotPermitted) {
      return forbidden('eID PKI хандах эрх (PKI_READ) олгогдоогүй байна');
    }
    if (err instanceof ErrSSOTokenExpired) {
      return unauthorized('eID мэдээлэл авахын тулд SSO-гоор дахин нэвтэрнэ үү');
    }
    if (err instanceof ErrSSOProxyDisabled) {
      return new DomainError(ErrorType.Internal, 'eID үйлчилгээ түр боломжгүй байна');
    }
    return internalCause(err);
  }

  // ──────────────── eID профайл: төлөөлдөг байгууллагууд ────────────────

  async eidRepresentations(ctx: Ctx, userId: string): Promise<Representation[]> {
    const etsi = await this.eidPersonEtsi(ctx, userId);
    // eID хэрэглэгч биш — алдаа биш, зүгээр хоосон (профайл хуудас эвдрэхгүй).
    if (etsi === '') return [];
    try {
      return await this.eid.representations(etsi, ctx.signal);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async registerEidOrganization(
    ctx: Ctx,
    userId: string,
    regNo: string,
  ): Promise<Representation[]> {
    const trimmed = regNo.trim();
    if (trimmed === '') throw badRequest('Байгууллагын регистрийн дугаар шаардлагатай');
    const etsi = await this.eidPersonEtsi(ctx, userId);
    if (etsi === '') {
      throw forbidden('Байгууллага холбохын тулд eID-ээр нэвтэрсэн байх шаардлагатай');
    }
    if (this.xyp === null) {
      throw new DomainError(ErrorType.Internal, 'Байгууллагын лавлагаа (XYP) тохируулагдаагүй');
    }

    let org: Organization;
    try {
      org = await this.xyp.lookup(trimmed, ctx.signal);
    } catch (err) {
      if (err instanceof ErrXypNotFound) {
        throw notFound('Энэ регистрийн дугаартай байгууллага олдсонгүй');
      }
      if (err instanceof ErrXypNotConfigured) {
        throw new DomainError(ErrorType.Internal, 'Байгууллагын лавлагаа (XYP) тохируулагдаагүй');
      }
      throw internalCause(err);
    }

    try {
      return await this.eid.addRepresentation(
        etsi,
        {
          orgRegister: org.reg_no,
          orgName: org.name,
          orgNameEn: '',
          affiliates: affiliatesFromXyp(org),
        },
        ctx.signal,
      );
    } catch (err) {
      if (err instanceof ErrNotRepresentative) {
        throw forbidden(
          'Та энэ байгууллагыг төлөөлөх эрхгүй байна (захирал / үүсгэн байгуулагч / хувь эзэмшигч биш)',
        );
      }
      throw internalCause(err);
    }
  }

  async unlinkEidOrganization(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
  ): Promise<Representation[]> {
    if (orgRegister.trim() === '') {
      throw badRequest('Байгууллагын регистрийн дугаар шаардлагатай');
    }
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      return await this.eid.removeRepresentation(etsi, orgRegister.trim(), ctx.signal);
    } catch (err) {
      if (err instanceof ErrNotRepresentative) {
        throw forbidden('Зөвхөн ADMIN эрхтэй хүн байгууллагыг салгаж чадна');
      }
      throw internalCause(err);
    }
  }

  async listEidOrgSigners(ctx: Ctx, userId: string, orgRegister: string): Promise<Signer[]> {
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      return await this.eid.orgSigners(orgRegister.trim(), etsi, ctx.signal);
    } catch (err) {
      throw this.mapSignerErr(err);
    }
  }

  async addEidOrgSigner(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    signerRegNo: string,
    role: string,
  ): Promise<SignersResult> {
    if (signerRegNo.trim() === '') {
      throw badRequest('Гарын үсэг зурагчийн регистрийн дугаар шаардлагатай');
    }
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      return await this.eid.addSigner(
        orgRegister.trim(),
        etsi,
        { signerRegNo: signerRegNo.trim(), role: role.trim() },
        ctx.signal,
      );
    } catch (err) {
      throw this.mapSignerErr(err);
    }
  }

  async resendEidOrgSigner(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    signerRegNo: string,
  ): Promise<SignersResult> {
    if (signerRegNo.trim() === '') {
      throw badRequest('Гарын үсэг зурагчийн регистрийн дугаар шаардлагатай');
    }
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      return await this.eid.resendSigner(orgRegister.trim(), etsi, signerRegNo.trim(), ctx.signal);
    } catch (err) {
      throw this.mapSignerErr(err);
    }
  }

  async removeEidOrgSigner(
    ctx: Ctx,
    userId: string,
    orgRegister: string,
    signerRegNo: string,
  ): Promise<Signer[]> {
    const etsi = await this.actingEtsi(ctx, userId);
    try {
      return await this.eid.removeSigner(orgRegister.trim(), etsi, signerRegNo.trim(), ctx.signal);
    } catch (err) {
      throw this.mapSignerErr(err);
    }
  }

  // ──────────────────── eID профайл: иргэний PKI самбар ────────────────────
  //
  // Дөрвүүлээ ижил бүтэцтэй: proxy идэвхтэй бол SSO-гоор, эс бол шууд eID рүү.
  // eID хэрэглэгч биш бол `null` (handler хоосон өгөгдөл харуулна).

  async eidSummary(ctx: Ctx, userId: string): Promise<PersonSummary | null> {
    const proxy = this.cfg.ssoEidProxy;
    if (this.eidProxyEnabled() && proxy) {
      const token = await this.ssoProxyAccessToken(ctx, userId);
      try {
        return await proxy.summary(token, ctx.signal);
      } catch (err) {
        throw this.mapPKIErr(err);
      }
    }
    const etsi = await this.eidPersonEtsi(ctx, userId);
    if (etsi === '') return null;
    try {
      return await this.eid.personSummary(etsi, ctx.signal);
    } catch (err) {
      throw this.mapPKIErr(err);
    }
  }

  async eidCertificates(ctx: Ctx, userId: string): Promise<PersonCertificates | null> {
    const proxy = this.cfg.ssoEidProxy;
    if (this.eidProxyEnabled() && proxy) {
      const token = await this.ssoProxyAccessToken(ctx, userId);
      try {
        return await proxy.certificates(token, ctx.signal);
      } catch (err) {
        throw this.mapPKIErr(err);
      }
    }
    const etsi = await this.eidPersonEtsi(ctx, userId);
    if (etsi === '') return null;
    try {
      return await this.eid.personCertificates(etsi, ctx.signal);
    } catch (err) {
      throw this.mapPKIErr(err);
    }
  }

  async eidDevices(ctx: Ctx, userId: string): Promise<PersonDevices | null> {
    const proxy = this.cfg.ssoEidProxy;
    if (this.eidProxyEnabled() && proxy) {
      const token = await this.ssoProxyAccessToken(ctx, userId);
      try {
        return await proxy.devices(token, ctx.signal);
      } catch (err) {
        throw this.mapPKIErr(err);
      }
    }
    const etsi = await this.eidPersonEtsi(ctx, userId);
    if (etsi === '') return null;
    try {
      return await this.eid.personDevices(etsi, ctx.signal);
    } catch (err) {
      throw this.mapPKIErr(err);
    }
  }

  async eidActivity(
    ctx: Ctx,
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PersonActivity | null> {
    const proxy = this.cfg.ssoEidProxy;
    if (this.eidProxyEnabled() && proxy) {
      const token = await this.ssoProxyAccessToken(ctx, userId);
      try {
        return await proxy.activity(token, limit, offset, ctx.signal);
      } catch (err) {
        throw this.mapPKIErr(err);
      }
    }
    const etsi = await this.eidPersonEtsi(ctx, userId);
    if (etsi === '') return null;
    try {
      return await this.eid.personActivity(etsi, limit, offset, ctx.signal);
    } catch (err) {
      throw this.mapPKIErr(err);
    }
  }
}

/**
 * affiliatesFromXyp нь XYP-ийн байгууллагаас эрх бүхий этгээдийн (захирал →
 * үүсгэн байгуулагч → хувь эзэмшигч дарааллаар) РД жагсаалтыг угсарна.
 *
 * Захирлыг ЭХЭНД тавьсан нь санамсаргүй биш: eidmongolia эхний таарсан бичлэгээр
 * role-г тодорхойлдог тул холбогдож буй этгээд ADMIN эрхтэй болно. Хоосон РД-г
 * алгасна.
 */
function affiliatesFromXyp(org: Organization): { regNo: string; role: string; kind: string }[] {
  const out: { regNo: string; role: string; kind: string }[] = [];
  const add = (regNo: string, role: string, kind: string): void => {
    if (regNo.trim() === '') return;
    out.push({ regNo: regNo.trim(), role: role.trim(), kind });
  };
  const ceoRole = org.ceo_position.trim() === '' ? 'Гүйцэтгэх захирал' : org.ceo_position;
  add(org.ceo_reg_no, ceoRole, 'CEO');
  for (const f of org.founders) add(f.reg_no, 'Үүсгэн байгуулагч', 'FOUNDER');
  for (const sh of org.stake_holders) {
    add(sh.reg_no, sh.position.trim() === '' ? 'Хувь эзэмшигч' : sh.position, 'STAKEHOLDER');
  }
  return out;
}

/** emptyPoll нь identity/токенгүй poll хариуг бүтээнэ. */
function emptyPoll(state: string): EIDPollResponse {
  return { state, user: null, mfaRequired: false, mfaToken: '', accessToken: '', refreshToken: '' };
}

/**
 * newAuthUsecase нь auth урсгалуудыг холбоно. Identity унших/бичихэд
 * UsersUsecase-ээс, session-д jwt/redis-ээс, нэвтрэлтэд eID/Google client-ээс
 * хамаарна.
 */
export function newAuthUsecase(
  users: UsersUsecase,
  jwtService: JWTService,
  eid: EidClient,
  xyp: Lookuper | null,
  google: GoogleClient | null,
  redisCache: RedisCache,
  cfg: AuthConfig,
): AuthUsecase {
  return new AuthUsecaseImpl(users, jwtService, eid, xyp, google, redisCache, cfg);
}
