// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/superadmin_onboarding нь УРИЛГААР ХААЛТТАЙ super admin бүртгэлийн
// шидтэн болон MFA-тай super admin нэвтрэлтийн 2 дахь шатыг хариуцна.
//
// Бүртгэлийн урсгал (алхам бүр Redis дэх түр "pending" session-оор холбогдоно):
//   1. google — Google OAuth code солих; и-мэйл нь ХҮЛЭЭГДЭЖ БУЙ урилгад байх
//      ёстой (эс бөгөөс 403). Энэ бол super admin болох ЦОРЫН ГАНЦ хаалга.
//   2. eid    — eID-ээр бодит хүнийг баталгаажуулж identity барина. Энэ алхамд
//      session ОЛГОГДОХГҮЙ, хэрэглэгч ҮҮСЭХГҮЙ.
//   3. email  — урилгын и-мэйл рүү OTP илгээж баталгаажуулна (Verify API).
//   4. totp   — authenticator app-д secret үүсгэж, кодоор баталгаажуулаад
//      ТӨГСГӨНӨ (finalize).
//
// Finalize нь super admin хэрэглэгчийг service RLS дор upsert хийж, нөөц
// кодуудыг hash-лан хадгалж, урилгыг accepted болгож, session олгоно. Энгийн
// текст нөөц кодууд ЗӨВХӨН энд, ЗӨВХӨН НЭГ УДАА буцна.

import { randomBytes } from 'node:crypto';

import { badRequest, forbidden, internalCause, isNotFound } from '../../apperror/index.js';
import type { RedisCache } from '../../datasources/caches/redis.js';
import type {
  RecoveryCodeRepository,
  SuperadminInviteRepository,
} from '../../datasources/repositories/interface/superadmin.js';
import type {
  SuperadminAccountRepository,
  UserRepository,
} from '../../datasources/repositories/interface/users.js';
import { inviteAccepted, normalizeInviteEmail } from '../../domain/superadmin_account.js';
import { emptyUser, isSuperAdmin, RoleSuperAdmin } from '../../domain/users.js';
import type { User } from '../../domain/users.js';
import { withService } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { Cipher } from '../../pkg/crypto/cipher.js';
import { newCipher } from '../../pkg/crypto/cipher.js';
import { ErrInitiateRejected, StateComplete } from '../../pkg/eid/eid.js';
import type { EidClient } from '../../pkg/eid/eid.js';
import type { GoogleClient } from '../../pkg/google/google.js';
import type { JWTService } from '../../pkg/jwt/jwt.js';
import * as logger from '../../pkg/logger/logger.js';
import {
  generateRecoveryCodes,
  hashAllRecoveryCodes,
  hashRecoveryCode,
} from '../../pkg/recovery/recovery.js';
import { generateTotp, validateTotp } from '../../pkg/totp/totp.js';
import { ErrNotApproved } from '../../pkg/verify/verify.js';
import type { VerifySender } from '../../pkg/verify/verify.js';
import { refreshKey, superadminMFAKey } from '../auth/redis_keys.js';

/** Шидтэний алхмууд — pending session-д хадгалагдана. */
export const StepEID = 'eid';
export const StepEmail = 'email';
export const StepTOTP = 'totp';
export const StepDone = 'done';

/** eidPollTimeoutMs нь IdP session long-poll-ийн хүлээх дээд хугацаа. */
const eidPollTimeoutMs = 25_000;

/**
 * mfaAttemptsTTLSeconds нь оролдлогын тоологчийн наслалт — mfa_token-ийн TTL
 * (5 мин)-ээс УРТ байх нь тоологчийг токеноос өмнө "мартагдахаас" сэргийлнэ
 * (эс бөгөөс оролдлогын хязгаарыг тойрч болно).
 */
const mfaAttemptsTTLSeconds = 15 * 60;

export interface OnboardingConfig {
  /** issuer нь authenticator app-д харагдах нэр. */
  issuer: string;
  pendingTTLSeconds: number;
  otpTTLSeconds: number;
  otpMaxAttempts: number;
  mfaMaxAttempts: number;
  eidDisplayText: string;
  recoveryCodeCount: number;
}

export interface OnboardingUsecase {
  google(
    ctx: Ctx,
    code: string,
    redirectUri: string,
  ): Promise<{ onboardToken: string; email: string; step: string }>;
  eidStart(ctx: Ctx, token: string, callbackUrl: string): Promise<EidStartResult>;
  eidStartByNationalId(
    ctx: Ctx,
    token: string,
    nationalId: string,
    callbackUrl: string,
  ): Promise<EidStartResult>;
  eidPoll(ctx: Ctx, token: string, sessionId: string): Promise<{ state: string; step: string }>;
  emailSend(ctx: Ctx, token: string): Promise<{ step: string }>;
  emailVerify(ctx: Ctx, token: string, code: string): Promise<{ step: string }>;
  totpInit(ctx: Ctx, token: string): Promise<{ secret: string; otpauthUrl: string; step: string }>;
  totpVerify(ctx: Ctx, token: string, code: string): Promise<FinalizeResult>;
  superadminMfa(ctx: Ctx, mfaToken: string, code: string): Promise<MfaResult>;
}

export interface EidStartResult {
  sessionId: string;
  deviceLinkUrl: string;
  verificationCode: string;
  expiresAt: string;
}

export interface FinalizeResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  /** recoveryCodes нь ЗӨВХӨН энд, ЗӨВХӨН НЭГ УДАА буцна. */
  recoveryCodes: string[];
  step: string;
}

export interface MfaResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  recoveryCodesLeft: number;
  usedRecoveryCode: boolean;
}

/**
 * PendingSession нь шидтэний алхмуудын хооронд Redis-д зөөгддөг төлөв.
 * ⚠️ pendingTotpSecret нь ХАРААХАН баталгаажаагүй (ил текст) secret — зөвхөн
 * энэ ТҮР session-д амьдарч, finalize үед л шифрлэгдэж DB-д бичигдэнэ.
 */
interface PendingSession {
  google_sub: string;
  email: string;
  name: string;
  picture: string;
  google_email_verified: boolean;
  civil_id: string;
  national_id: string;
  first_name: string;
  last_name: string;
  first_name_en: string;
  last_name_en: string;
  kyc_level: string;
  email_verified: boolean;
  pending_totp_secret: string;
  step: string;
}

const onboardKey = (token: string): string => `superadmin_onboard:${token}`;
const onboardOtpKey = (token: string): string => `superadmin_onboard_otp:${token}`;
const onboardOtpAttemptsKey = (token: string): string => `superadmin_onboard_otp_attempts:${token}`;
const mfaAttemptsKey = (token: string): string => `superadmin_mfa_attempts:${token}`;

class OnboardingUsecaseImpl implements OnboardingUsecase {
  private readonly cipher: Cipher;

  constructor(
    private readonly googleClient: GoogleClient,
    private readonly eid: EidClient,
    private readonly verifier: VerifySender,
    private readonly users: UserRepository,
    private readonly recovery: RecoveryCodeRepository,
    private readonly accounts: SuperadminAccountRepository,
    private readonly invites: SuperadminInviteRepository,
    private readonly jwt: JWTService,
    private readonly redis: RedisCache,
    encKey: string,
    private readonly cfg: OnboardingConfig,
  ) {
    this.cipher = newCipher(encKey);
  }

  // ── Pending session ─────────────────────────────────────────────────

  /**
   * loadPending нь токеноор session-ийг уншина. Байхгүй/хугацаа дууссан/
   * эвдэрсэн бол Forbidden — fail-closed (шидтэнг дахин эхлүүлнэ).
   */
  private async loadPending(ctx: Ctx, token: string): Promise<PendingSession> {
    if (token === '') throw badRequest('onboard_token is required');
    let raw = '';
    try {
      raw = await this.redis.get(ctx, onboardKey(token));
    } catch {
      raw = '';
    }
    if (raw === '') {
      logger.warnWithContext(ctx, 'superadmin onboarding: pending session олдсонгүй', {
        usecase: 'superadmin_onboarding',
        method: 'loadPending',
      });
      throw forbidden(
        'Бүртгэлийн session хүчингүй эсвэл хугацаа нь дууссан байна. Дахин эхлүүлнэ үү.',
      );
    }
    try {
      return JSON.parse(raw) as PendingSession;
    } catch {
      throw forbidden('Бүртгэлийн session хүчингүй байна. Дахин эхлүүлнэ үү.');
    }
  }

  /** savePending нь session-ийг TTL-тэйгээр бичнэ. Redis алдаа нь fatal. */
  private async savePending(ctx: Ctx, token: string, s: PendingSession): Promise<void> {
    try {
      await this.redis.setTTL(
        ctx,
        onboardKey(token),
        JSON.stringify(s),
        this.cfg.pendingTTLSeconds,
      );
    } catch (err) {
      throw internalCause(new Error(`store pending session: ${logger.errText(err)}`));
    }
  }

  /** requireStep нь шидтэний алхмыг АЛГАСАХААС сэргийлнэ. */
  private static requireStep(s: PendingSession, want: string): void {
    if (s.step !== want) {
      throw badRequest(`энэ алхам одоогоор боломжгүй (хүлээгдэж буй алхам: ${s.step})`);
    }
  }

  // ── 1. Google ───────────────────────────────────────────────────────

  async google(
    ctx: Ctx,
    code: string,
    redirectUri: string,
  ): Promise<{ onboardToken: string; email: string; step: string }> {
    if (!this.googleClient.configured()) {
      throw internalCause(new Error('google login not configured'));
    }

    let gu;
    try {
      gu = await this.googleClient.exchange(code, redirectUri, ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin onboarding failed: token exchange', {
        usecase: 'superadmin_onboarding',
        method: 'google',
        error: logger.errText(err),
      });
      throw badRequest('Google нэвтрэлт амжилтгүй боллоо');
    }

    const email = normalizeInviteEmail(gu.email);
    if (email === '') throw badRequest('Google бүртгэлээс и-мэйл авч чадсангүй');
    // Баталгаажаагүй Google и-мэйлээр урилгын allow-list-ыг ТОЙРОХ боломжгүй.
    if (!gu.emailVerified) {
      logger.warnWithContext(ctx, 'superadmin onboarding: Google и-мэйл баталгаажаагүй', {
        usecase: 'superadmin_onboarding',
        method: 'google',
      });
      throw forbidden('Google бүртгэлийн и-мэйл баталгаажаагүй байна');
    }

    // Урилгын шалгалт — энэ бол бүртгэлийн ханын хаалга.
    let invite;
    try {
      invite = await this.invites.getByEmail(withService(ctx), email);
    } catch (err) {
      if (isNotFound(err)) {
        logger.warnWithContext(ctx, 'superadmin onboarding: урилгагүй и-мэйл', {
          usecase: 'superadmin_onboarding',
          method: 'google',
        });
        throw forbidden('Энэ и-мэйл super admin болох урилга аваагүй байна');
      }
      throw err;
    }
    if (inviteAccepted(invite)) {
      throw forbidden('Энэ урилга аль хэдийн ашиглагдсан байна');
    }

    const token = randomBytes(16).toString('hex');
    // ⚠️ И-мэйлийг Google-ийн буцаасан утгаас БИШ, УРИЛГЫН мөрөөс авна —
    // цаашдын бүх алхам урьсан и-мэйл дээр л ажиллана.
    await this.savePending(ctx, token, {
      google_sub: gu.sub,
      email: invite.email,
      name: gu.name,
      picture: gu.picture,
      google_email_verified: gu.emailVerified,
      civil_id: '',
      national_id: '',
      first_name: '',
      last_name: '',
      first_name_en: '',
      last_name_en: '',
      kyc_level: '',
      email_verified: false,
      pending_totp_secret: '',
      step: StepEID,
    });

    logger.infoWithContext(ctx, 'superadmin onboarding эхэллээ (Google баталгаажлаа)', {
      usecase: 'superadmin_onboarding',
      method: 'google',
      step: StepEID,
    });
    return { onboardToken: token, email: invite.email, step: StepEID };
  }

  // ── 2. eID ──────────────────────────────────────────────────────────

  async eidStart(ctx: Ctx, token: string, callbackUrl: string): Promise<EidStartResult> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepEID);
    try {
      const start = await this.eid.qrInitiate(this.cfg.eidDisplayText, callbackUrl, ctx.signal);
      return {
        sessionId: start.sessionId,
        deviceLinkUrl: start.deviceLinkUrl,
        verificationCode: start.verificationCode,
        expiresAt: start.expiresAt,
      };
    } catch (err) {
      throw OnboardingUsecaseImpl.mapInitiateErr(err, 'eID session эхлүүлэх боломжгүй байна');
    }
  }

  async eidStartByNationalId(
    ctx: Ctx,
    token: string,
    nationalId: string,
    callbackUrl: string,
  ): Promise<EidStartResult> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepEID);
    const id = nationalId.trim();
    if (id === '') throw badRequest('national_id is required');
    try {
      const start = await this.eid.initiate(id, this.cfg.eidDisplayText, callbackUrl, ctx.signal);
      return {
        sessionId: start.sessionId,
        deviceLinkUrl: start.deviceLinkUrl,
        verificationCode: start.verificationCode,
        expiresAt: start.expiresAt,
      };
    } catch (err) {
      throw OnboardingUsecaseImpl.mapInitiateErr(
        err,
        'Регистрийн дугаар олдсонгүй эсвэл буруу байна',
      );
    }
  }

  /**
   * eidPoll нь eID session-ийг long-poll-оор асууна. COMPLETE болоход
   * identity-г pending session-д БАРИНА.
   *
   * ⚠️ Энэ алхамд хэрэглэгч ҮҮСГЭХГҮЙ, session ОЛГОХГҮЙ — eID нь зөвхөн "энэ
   * и-мэйлийг урьсан хүн бодитоор хэн бэ" гэдгийг тогтоох баталгаажуулалт.
   */
  async eidPoll(
    ctx: Ctx,
    token: string,
    sessionId: string,
  ): Promise<{ state: string; step: string }> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepEID);
    if (sessionId === '') throw badRequest('session_id is required');

    let res;
    try {
      res = await this.eid.session(sessionId, eidPollTimeoutMs, ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin onboarding eidPoll failed: session error', {
        usecase: 'superadmin_onboarding',
        method: 'eidPoll',
        error: logger.errText(err),
      });
      throw internalCause(new Error(`eid session: ${logger.errText(err)}`));
    }
    if (res.state !== StateComplete) return { state: res.state, step: StepEID };

    // Public RP-д IdP нь national_id-г илчлэхгүй тул civil_id нь давтагдашгүй
    // түлхүүр; хоосон бол identity дутуу гэж үзэж татгалзана (РД/civil_id-г
    // лог-д БИЧИХГҮЙ — хувийн мэдээлэл).
    const id = res.identity;
    if (!id || id.civilId.trim() === '') {
      logger.errorWithContext(ctx, 'superadmin onboarding eidPoll: complete without identity', {
        usecase: 'superadmin_onboarding',
        method: 'eidPoll',
        has_identity: res.identity !== null,
      });
      throw internalCause(new Error('eid complete without identity'));
    }

    sess.civil_id = id.civilId.trim().toLowerCase();
    sess.national_id = id.nationalId.trim().toLowerCase();
    sess.first_name = id.givenName.trim();
    sess.last_name = id.surname.trim();
    sess.first_name_en = id.givenNameEn.trim();
    sess.last_name_en = id.surnameEn.trim();
    sess.kyc_level = id.kycLevel.trim();
    sess.step = StepEmail;
    await this.savePending(ctx, token, sess);

    logger.infoWithContext(ctx, 'superadmin onboarding: eID баталгаажлаа', {
      usecase: 'superadmin_onboarding',
      method: 'eidPoll',
      step: StepEmail,
    });
    return { state: StateComplete, step: StepEmail };
  }

  // ── 3. И-мэйл OTP ───────────────────────────────────────────────────

  async emailSend(ctx: Ctx, token: string): Promise<{ step: string }> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepEmail);

    let requestId: string;
    try {
      requestId = await this.verifier.send(sess.email, '', ctx.signal);
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin onboarding: OTP илгээх амжилтгүй', {
        usecase: 'superadmin_onboarding',
        method: 'emailSend',
        error: logger.errText(err),
      });
      throw internalCause(new Error(`verify send: ${logger.errText(err)}`));
    }
    try {
      await this.redis.setTTL(ctx, onboardOtpKey(token), requestId, this.cfg.otpTTLSeconds);
      // Шинэ код илгээх нь оролдлогын тоологчийг ТЭГЛЭНЭ.
      await this.redis.del(ctx, onboardOtpAttemptsKey(token));
    } catch (err) {
      throw internalCause(new Error(`store otp request: ${logger.errText(err)}`));
    }
    return { step: StepEmail };
  }

  async emailVerify(ctx: Ctx, token: string, code: string): Promise<{ step: string }> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepEmail);
    if (code.trim() === '') throw badRequest('Баталгаажуулах код шаардлагатай');

    let requestId = '';
    try {
      requestId = await this.redis.get(ctx, onboardOtpKey(token));
    } catch {
      requestId = '';
    }
    if (requestId === '') {
      throw badRequest('Баталгаажуулах кодын хугацаа дууссан байна. Дахин илгээнэ үү.');
    }

    // Оролдлогын хязгаар — Verify API өөрөө ч хязгаарладаг, энэ нь давхар хаалт.
    let attempts = 0;
    try {
      attempts = await this.redis.incr(ctx, onboardOtpAttemptsKey(token));
      if (attempts === 1) {
        await this.redis.expire(ctx, onboardOtpAttemptsKey(token), this.cfg.otpTTLSeconds);
      }
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin onboarding: OTP оролдлого тоолох амжилтгүй', {
        usecase: 'superadmin_onboarding',
        method: 'emailVerify',
        error: logger.errText(err),
      });
    }
    if (this.cfg.otpMaxAttempts > 0 && attempts > this.cfg.otpMaxAttempts) {
      await this.redis.del(ctx, onboardOtpKey(token)).catch(() => undefined);
      throw forbidden('Хэт олон буруу оролдлого — кодыг дахин илгээнэ үү');
    }

    try {
      await this.verifier.check(requestId, code.trim(), ctx.signal);
    } catch (err) {
      if (err instanceof ErrNotApproved) throw badRequest('Баталгаажуулах код буруу байна');
      throw internalCause(new Error(`verify check: ${logger.errText(err)}`));
    }

    sess.email_verified = true;
    sess.step = StepTOTP;
    await this.savePending(ctx, token, sess);
    await this.redis.del(ctx, onboardOtpKey(token)).catch(() => undefined);
    await this.redis.del(ctx, onboardOtpAttemptsKey(token)).catch(() => undefined);
    return { step: StepTOTP };
  }

  // ── 4. TOTP + finalize ──────────────────────────────────────────────

  async totpInit(
    ctx: Ctx,
    token: string,
  ): Promise<{ secret: string; otpauthUrl: string; step: string }> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepTOTP);
    // Дахин дуудвал ШИНЭ secret үүснэ — QR-аа алдсан бол дахин эхлэх боломж.
    const { secret, url } = generateTotp(this.cfg.issuer, sess.email);
    sess.pending_totp_secret = secret;
    await this.savePending(ctx, token, sess);
    return { secret, otpauthUrl: url, step: StepTOTP };
  }

  async totpVerify(ctx: Ctx, token: string, code: string): Promise<FinalizeResult> {
    const sess = await this.loadPending(ctx, token);
    OnboardingUsecaseImpl.requireStep(sess, StepTOTP);
    if (sess.pending_totp_secret === '') {
      throw badRequest('Эхлээд TOTP тохируулгыг эхлүүлнэ үү');
    }
    // Урьдчилсан алхмуудын баталгаа — session эвдэрсэн ч алхам АЛГАСАХГҮЙ.
    if (!sess.email_verified || sess.civil_id === '' || sess.google_sub === '') {
      throw badRequest('Бүртгэлийн алхмууд дутуу байна. Дахин эхлүүлнэ үү.');
    }
    if (!validateTotp(code, sess.pending_totp_secret)) {
      logger.warnWithContext(ctx, 'superadmin onboarding: TOTP код буруу', {
        usecase: 'superadmin_onboarding',
        method: 'totpVerify',
      });
      throw badRequest('Баталгаажуулах код буруу байна');
    }

    // TOTP secret нь storage-д ил текстээр ХЭЗЭЭ Ч бичигдэхгүй (AES-256-GCM).
    const encSecret = this.cipher.encrypt(sess.pending_totp_secret);

    // Super admin-ы users мөр — Google/email-ээр түлхүүрлэнэ, civil_id-г users-д
    // ТАВИХГҮЙ (нэг хүн eID-ээр admin, Google-оор super admin байж чадахын
    // тулд). eID баталгаа болон MFA нь superadmin_accounts-д очно.
    const now = new Date();
    const user: User = {
      ...emptyUser(),
      username: `sa_${sess.civil_id}`,
      firstName: sess.first_name,
      lastName: sess.last_name,
      firstNameEn: sess.first_name_en,
      lastNameEn: sess.last_name_en,
      email: sess.email,
      active: true,
      roleId: RoleSuperAdmin,
      kycLevel: sess.kyc_level,
      googleSub: sess.google_sub,
      googleEmail: sess.email,
      googleEmailVerified: sess.google_email_verified,
      googleName: sess.name,
      googlePicture: sess.picture,
      createdAt: now,
    };

    // Хэрэглэгч хараахан нэвтрээгүй тул бичилт нь service RLS дор явна.
    const sctx = withService(ctx);
    let stored: User;
    try {
      stored = await this.users.upsertSuperAdmin(sctx, user, {
        userId: '',
        civilId: sess.civil_id,
        nationalId: sess.national_id,
        emailVerified: true,
        mfaEnabled: true,
        totpSecret: encSecret,
        invitedBy: '',
        onboardedAt: null,
        createdAt: now,
        updatedAt: null,
      });
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin onboarding: upsert амжилтгүй', {
        usecase: 'superadmin_onboarding',
        method: 'totpVerify',
        error: logger.errText(err),
      });
      throw err;
    }

    // Нөөц кодууд — энгийн текстийг НЭГ УДАА буцааж, зөвхөн hash-ийг хадгална.
    const codes = generateRecoveryCodes(this.cfg.recoveryCodeCount);
    await this.recovery.replace(sctx, stored.id, hashAllRecoveryCodes(codes));

    // Урилгыг ашигласан гэж тэмдэглэнэ. Хэрэглэгч аль хэдийн үүссэн тул энэ
    // алдаа нэвтрэлтийг эвдэхгүй (best-effort).
    try {
      await this.invites.markAccepted(sctx, sess.email);
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin onboarding: урилгыг accepted болгож чадсангүй', {
        usecase: 'superadmin_onboarding',
        method: 'totpVerify',
        error: logger.errText(err),
        user_id: stored.id,
      });
    }

    // Шидтэн дууссан — ил текст TOTP secret агуулсан session-ийг УСТГАНА.
    await this.redis.del(ctx, onboardKey(token)).catch(() => undefined);

    const pair = await this.mintSession(ctx, stored);
    logger.infoWithContext(ctx, 'superadmin onboarding төгслөө — шинэ super admin үүслээ', {
      usecase: 'superadmin_onboarding',
      method: 'totpVerify',
      user_id: stored.id,
    });
    return {
      user: stored,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      recoveryCodes: codes,
      step: StepDone,
    };
  }

  // ── MFA нэвтрэлтийн 2 дахь шат ──────────────────────────────────────

  /**
   * superadminMfa нь auth.googleLogin/eidPoll-ийн үүсгэсэн mfa_token-ийг TOTP
   * код ЭСВЭЛ нөөц кодоор баталгаажуулж session олгоно. Ингэснээр super
   * admin-ий олгогдсон АЛИВАА session нь угаасаа MFA-баталгаажсан байна.
   *
   * Токен тус бүрийн буруу оролдлогыг тоолж, хязгаарт хүрмэгц токеныг УСТГАНА
   * (TOTP нь 6 орон тул brute-force-оос хамгаална).
   */
  async superadminMfa(ctx: Ctx, mfaToken: string, code: string): Promise<MfaResult> {
    if (mfaToken === '' || code === '') throw badRequest('mfa_token болон code шаардлагатай');

    const tokenKey = superadminMFAKey(mfaToken);
    let userId = '';
    try {
      userId = await this.redis.get(ctx, tokenKey);
    } catch {
      userId = '';
    }
    // Redis алдаа/байхгүй токен → fail-closed (нэвтрүүлэхгүй).
    if (userId === '') {
      logger.warnWithContext(ctx, 'superadmin MFA: токен хүчингүй/хугацаа дууссан', {
        usecase: 'superadmin_onboarding',
        method: 'superadminMfa',
      });
      throw forbidden(
        'Нэвтрэлтийн session хүчингүй эсвэл хугацаа нь дууссан байна. Дахин нэвтэрнэ үү.',
      );
    }

    const attemptsKey = mfaAttemptsKey(mfaToken);
    let attempts = 0;
    try {
      attempts = await this.redis.incr(ctx, attemptsKey);
      if (attempts === 1) await this.redis.expire(ctx, attemptsKey, mfaAttemptsTTLSeconds);
    } catch (err) {
      logger.errorWithContext(ctx, 'superadmin MFA: оролдлого тоолох амжилтгүй (non-fatal)', {
        usecase: 'superadmin_onboarding',
        method: 'superadminMfa',
        error: logger.errText(err),
      });
    }
    if (attempts > this.cfg.mfaMaxAttempts) {
      await this.redis.del(ctx, tokenKey).catch(() => undefined);
      await this.redis.del(ctx, attemptsKey).catch(() => undefined);
      logger.warnWithContext(ctx, 'superadmin MFA: оролдлого хэтэрлээ — токен цуцлагдлаа', {
        usecase: 'superadmin_onboarding',
        method: 'superadminMfa',
        attempts,
      });
      throw forbidden('Хэт олон буруу оролдлого — дахин нэвтэрнэ үү');
    }

    // Хэрэглэгчийг service RLS дор уншина (хараахан нэвтрээгүй).
    const sctx = withService(ctx);
    const user = await this.users.getById(sctx, userId);
    // Токен олгогдсоноос хойш эрх/MFA өөрчлөгдсөн байж болзошгүй тул super
    // admin эсэх + MFA идэвхтэй эсэхийг ДАХИН шалгана (account алга бол
    // fail-closed).
    let mfaEnabled = false;
    let totpSecretEnc = '';
    try {
      const account = await this.accounts.get(sctx, userId);
      mfaEnabled = account.mfaEnabled;
      totpSecretEnc = account.totpSecret;
    } catch {
      mfaEnabled = false;
    }
    if (!isSuperAdmin(user) || !mfaEnabled) {
      logger.warnWithContext(ctx, 'superadmin MFA: хэрэглэгч super admin биш эсвэл MFA идэвхгүй', {
        usecase: 'superadmin_onboarding',
        method: 'superadminMfa',
        user_id: user.id,
      });
      await this.redis.del(ctx, tokenKey).catch(() => undefined);
      throw forbidden('Энэ нэвтрэлт боломжгүй байна');
    }

    const usedRecovery = await this.verifyMfaCode(sctx, user, totpSecretEnc, code);

    // Амжилттай — токен НЭГ УДААГИЙН тул устгана.
    await this.redis.del(ctx, tokenKey).catch(() => undefined);
    await this.redis.del(ctx, attemptsKey).catch(() => undefined);

    const pair = await this.mintSession(ctx, user);
    let left = 0;
    if (usedRecovery) {
      try {
        left = (await this.recovery.listActive(sctx, user.id)).length;
      } catch {
        left = 0;
      }
      logger.warnWithContext(ctx, 'superadmin MFA: нөөц кодоор нэвтэрлээ', {
        usecase: 'superadmin_onboarding',
        method: 'superadminMfa',
        user_id: user.id,
        codes_left: left,
      });
    }

    return {
      user,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      recoveryCodesLeft: left,
      usedRecoveryCode: usedRecovery,
    };
  }

  /**
   * verifyMfaCode нь кодыг эхлээд TOTP-ээр (шифрлэгдсэн secret-ийг тайлж), тэр
   * нь таарахгүй бол нөөц кодоор (SHA-256 тулгалт, НЭГ УДААГИЙН) шалгана.
   */
  private async verifyMfaCode(
    ctx: Ctx,
    user: User,
    totpSecretEnc: string,
    code: string,
  ): Promise<boolean> {
    if (totpSecretEnc !== '') {
      let secret = '';
      try {
        secret = this.cipher.decrypt(totpSecretEnc);
      } catch (err) {
        // Шифр тайлагдахгүй бол түлхүүр солигдсон/өгөгдөл эвдэрсэн — нөөц
        // кодоор нэвтрэх боломж ҮЛДЭНЭ тул энд зогсохгүй.
        logger.errorWithContext(ctx, 'superadmin MFA: TOTP secret тайлах амжилтгүй', {
          usecase: 'superadmin_onboarding',
          method: 'verifyMfaCode',
          error: logger.errText(err),
          user_id: user.id,
        });
      }
      if (secret !== '' && validateTotp(code, secret)) return false;
    }

    try {
      await this.recovery.consume(ctx, user.id, hashRecoveryCode(code));
      return true;
    } catch (err) {
      // Аль нь ч биш — цөөн үгтэй, тоочих (enumeration) боломжгүй мессеж.
      if (isNotFound(err)) throw badRequest('Баталгаажуулах код буруу байна');
      throw internalCause(new Error(`consume recovery code: ${logger.errText(err)}`));
    }
  }

  /**
   * mintSession нь access+refresh хос үүсгэж, refresh-ийг Redis-д тэмдэглэнэ —
   * auth-ийн түлхүүрийн нэрийг дахин ашигласнаар /refresh, /logout урсгалууд
   * энэ замаар олгогдсон session-д мөн адил ажиллана.
   */
  private async mintSession(
    ctx: Ctx,
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const pair = this.jwt.generateTokenPair(user.id, isSuperAdmin(user), user.roleId, user.email);
    const ttlSeconds = Math.floor((pair.refresh_expires_at.getTime() - Date.now()) / 1000);
    if (ttlSeconds <= 0) throw internalCause(new Error('refresh token already expired'));
    try {
      await this.redis.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, ttlSeconds);
    } catch (err) {
      throw internalCause(new Error(`persist refresh: ${logger.errText(err)}`));
    }
    return { accessToken: pair.access_token, refreshToken: pair.refresh_token };
  }

  /**
   * mapInitiateErr нь eID initiate-ийн алдааг HTTP статус руу буулгана: IdP-ийн
   * 4xx бол цэвэр BadRequest, бусад (сүлжээ/5xx) бол дотоод алдаа.
   */
  private static mapInitiateErr(err: unknown, clientMsg: string): Error {
    if (err instanceof ErrInitiateRejected) return badRequest(clientMsg);
    return internalCause(new Error(`eid initiate: ${logger.errText(err)}`));
  }
}

export const newOnboardingUsecase = (
  googleClient: GoogleClient,
  eid: EidClient,
  verifier: VerifySender,
  users: UserRepository,
  recovery: RecoveryCodeRepository,
  accounts: SuperadminAccountRepository,
  invites: SuperadminInviteRepository,
  jwt: JWTService,
  redis: RedisCache,
  encKey: string,
  cfg: OnboardingConfig,
): OnboardingUsecase => {
  // encKey хоосон бол TOTP secret-ийг ил текстээр хадгалах эрсдэлтэй тул
  // fail-closed (newCipher өөрөө ч шалгана).
  if (encKey === '') {
    throw new Error('superadmin onboarding: encryption key (INTEGRATION_ENC_KEY) is required');
  }
  return new OnboardingUsecaseImpl(
    googleClient,
    eid,
    verifier,
    users,
    recovery,
    accounts,
    invites,
    jwt,
    redis,
    encKey,
    cfg,
  );
};
