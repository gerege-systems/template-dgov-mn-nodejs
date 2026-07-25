// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /auth/superadmin/* — урилгаар хаалттай super admin бүртгэлийн шидтэн болон
// MFA-тай нэвтрэлтийн 2 дахь шат. Бүгд НЭВТРЭЭГҮЙ гадаргуу: хаалт нь урилгын
// allow-list (Google алхам), onboard_token (бусад алхам) болон mfa_token +
// TOTP/нөөц код (/mfa) дээр тогтоно.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { OnboardingUsecase } from '../../../../usecases/superadmin_onboarding/onboarding_usecase.js';
import { userResponseFromDomain } from '../../../dto/responses/user.js';
import { decodeBody, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler } from '../../../types.js';

const googleSchema = strictObject({
  code: z.string().min(1).max(2048),
  redirect_uri: z.string().max(500).optional(),
});

const tokenSchema = strictObject({ onboard_token: z.string().min(1).max(128) });

const eidStartSchema = strictObject({
  onboard_token: z.string().min(1).max(128),
  callback_url: z.string().max(500).optional(),
});

const eidStartIdSchema = strictObject({
  onboard_token: z.string().min(1).max(128),
  national_id: z.string().min(1).max(20),
  callback_url: z.string().max(500).optional(),
});

const eidPollSchema = strictObject({
  onboard_token: z.string().min(1).max(128),
  session_id: z.string().min(1).max(200),
});

const codeSchema = strictObject({
  onboard_token: z.string().min(1).max(128),
  code: z.string().min(1).max(20),
});

const mfaSchema = strictObject({
  mfa_token: z.string().min(1).max(128),
  code: z.string().min(1).max(40),
});

export class SuperadminOnboardHandler {
  constructor(private readonly usecase: OnboardingUsecase) {}

  /**
   * google нь шидтэний 1 дэх алхам — OAuth code солиж, и-мэйлийг урилгын
   * allow-list-ийн эсрэг шалгана (урилгагүй/ашигласан бол 403).
   *
   * POST /auth/superadmin/onboard/google · 200 · 400 · 403
   */
  google: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, googleSchema);
    const out = await this.usecase.google(req.ctx, body.code, body.redirect_uri ?? '');
    newSuccessResponse(req, res, 200, 'ok', {
      onboard_token: out.onboardToken,
      email: out.email,
      step: out.step,
    });
  };

  /** POST /auth/superadmin/onboard/eid/start — QR/deep-link (cross-device). */
  eidStart: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, eidStartSchema);
    const out = await this.usecase.eidStart(req.ctx, body.onboard_token, body.callback_url ?? '');
    newSuccessResponse(req, res, 200, 'ok', {
      session_id: out.sessionId,
      device_link_url: out.deviceLinkUrl,
      verification_code: out.verificationCode,
      expires_at: out.expiresAt,
    });
  };

  /** POST /auth/superadmin/onboard/eid/start-id — РД-аар утас руу push. */
  eidStartByNationalId: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, eidStartIdSchema);
    const out = await this.usecase.eidStartByNationalId(
      req.ctx,
      body.onboard_token,
      body.national_id,
      body.callback_url ?? '',
    );
    newSuccessResponse(req, res, 200, 'ok', {
      session_id: out.sessionId,
      device_link_url: out.deviceLinkUrl,
      verification_code: out.verificationCode,
      expires_at: out.expiresAt,
    });
  };

  /**
   * eidPoll нь eID session-ийн төлвийг long-poll-оор асууна. COMPLETE үед
   * identity нь pending session-д БАРИГДАНА — токен/хэрэглэгч ГАРАХГҮЙ.
   *
   * POST /auth/superadmin/onboard/eid/poll · 200 · 400 · 403
   */
  eidPoll: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, eidPollSchema);
    const out = await this.usecase.eidPoll(req.ctx, body.onboard_token, body.session_id);
    newSuccessResponse(req, res, 200, 'ok', { state: out.state, step: out.step });
  };

  /** POST /auth/superadmin/onboard/email/send — урилгын и-мэйл рүү OTP. */
  emailSend: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, tokenSchema);
    const out = await this.usecase.emailSend(req.ctx, body.onboard_token);
    newSuccessResponse(req, res, 200, 'ok', { step: out.step });
  };

  /** POST /auth/superadmin/onboard/email/verify — OTP шалгах. */
  emailVerify: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, codeSchema);
    const out = await this.usecase.emailVerify(req.ctx, body.onboard_token, body.code);
    newSuccessResponse(req, res, 200, 'ok', { step: out.step });
  };

  /**
   * totpInit нь шинэ secret үүсгэж otpauth:// URI буцаана (QR-г frontend
   * зурна). Дахин дуудвал ШИНЭ secret үүснэ.
   */
  totpInit: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, tokenSchema);
    const out = await this.usecase.totpInit(req.ctx, body.onboard_token);
    newSuccessResponse(req, res, 200, 'ok', {
      secret: out.secret,
      otpauth_url: out.otpauthUrl,
      step: out.step,
    });
  };

  /**
   * totpVerify нь кодыг шалгаж бүртгэлийг ТӨГСГӨНӨ. Энгийн текст нөөц кодууд
   * ЗӨВХӨН энэ хариунд, ЗӨВХӨН НЭГ УДАА буцна (дахин авах зам БАЙХГҮЙ).
   *
   * POST /auth/superadmin/onboard/totp/verify · 200 · 400 · 403
   */
  totpVerify: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, codeSchema);
    const out = await this.usecase.totpVerify(req.ctx, body.onboard_token, body.code);
    newSuccessResponse(req, res, 200, 'ok', {
      ...userResponseFromDomain(out.user),
      token: out.accessToken,
      refresh_token: out.refreshToken,
      recovery_codes: out.recoveryCodes,
      step: out.step,
    });
  };

  /**
   * mfa нь нэвтрэлтийн 2 дахь шат — mfa_token-ийг TOTP код ЭСВЭЛ нөөц кодоор
   * баталгаажуулж session олгоно. Нөөц код НЭГ УДААГИЙН.
   *
   * POST /auth/superadmin/mfa · 200 · 400 · 403
   */
  mfa: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, mfaSchema);
    const out = await this.usecase.superadminMfa(req.ctx, body.mfa_token, body.code);
    newSuccessResponse(req, res, 200, 'ok', {
      ...userResponseFromDomain(out.user),
      token: out.accessToken,
      refresh_token: out.refreshToken,
      ...(out.usedRecoveryCode
        ? { used_recovery_code: true, recovery_codes_left: out.recoveryCodesLeft }
        : {}),
    });
  };
}

export const newSuperadminOnboardHandler = (usecase: OnboardingUsecase): SuperadminOnboardHandler =>
  new SuperadminOnboardHandler(usecase);
