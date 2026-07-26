// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /sso/* endpoint-ууд — гадаад SSO provider (OIDC)-ээр нэвтрэх урсгал.
//
// Бүгд НЭВТРЭХЭЭС ӨМНӨХ урсгал (service RLS контекст). Токенууд хариунд
// буцдаг — клиент тал (BFF) тэдгээрийг httpOnly cookie-д суулгаж, browser-ийн
// JS-д хэзээ ч гаргахгүй.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { SSOUsecase } from '../../../../usecases/sso/sso_usecase.js';
import { userResponseFromDomain } from '../../../dto/responses/user.js';
import { issueSessionCookies, setSsoLogoutRef, ssoLogoutRefFromCookie } from '../../../cookies.js';
import { decodeBody, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler } from '../../../types.js';

/** callbackSchema нь BFF-ээс ирэх callback параметрүүд. */
const callbackSchema = strictObject({
  state: z.string().min(1).max(256),
  code: z.string().min(1).max(4096),
});

/** nativeSchema нь mobile (PKCE) урсгалын code exchange. */
const nativeSchema = strictObject({
  code: z.string().min(1).max(4096),
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z.string().min(1).max(400),
});

/**
 * logoutSchema нь callback-д олгосон logout ref. SPA нь ref-ийг МЭДДЭГГҮЙ (тэр
 * нь httpOnly cookie-д) тул талбар нь СОНГОЛТТОЙ — байхгүй бол сервер өөрөө
 * cookie-гоос уншина. Мобайл/m2m клиент ref-ээ биеэр дамжуулсаар байна.
 */
const logoutSchema = strictObject({
  ref: z.string().max(64).optional(),
});

export class SSOHandler {
  constructor(private readonly usecase: SSOUsecase) {}

  /** POST /sso/start · 200 — browser-ийг чиглүүлэх authorize URL. */
  start: AsyncHandler = async (req, res) => {
    const authUrl = await this.usecase.start(req.ctx);
    newSuccessResponse(req, res, 200, 'sso started', { auth_url: authUrl });
  };

  /**
   * callback нь state+code-ийг шалгаж, иргэнийг upsert хийн JWT хос олгоно.
   *
   * POST /sso/callback · 200 · 400 (state хугацаа дууссан) · 403 (private)
   */
  callback: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, callbackSchema);
    const out = await this.usecase.complete(req.ctx, body.state, body.code);
    // Browser урсгал — токенуудыг httpOnly cookie-д (JSON бие хэвээр).
    issueSessionCookies(res, out.token, out.refreshToken);
    // SSO logout ref-ийг httpOnly cookie-д — гарах үед сервер өөрөө уншиж
    // IdP дээрх session-ийг ч дуусгана (эс бөгөөс "гараад дахин автоматаар
    // нэвтэрч орох" болно).
    setSsoLogoutRef(res, out.logoutRef);
    newSuccessResponse(req, res, 200, 'sso login complete', {
      token: out.token,
      refresh_token: out.refreshToken,
      sso_logout_ref: out.logoutRef,
      user_id: out.user.id,
      username: out.user.username,
    });
  };

  /**
   * ssoNative нь mobile (PKCE, public client) урсгалын code-ийг солино. State
   * шалгалтГҮЙ — PKCE (code_verifier) нь replay/interception хамгаалалтыг хангана.
   *
   * POST /sso/native · 200 · 400 · 422
   */
  ssoNative: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, nativeSchema);
    const out = await this.usecase.completeNative(
      req.ctx,
      body.code,
      body.code_verifier,
      body.redirect_uri,
    );
    newSuccessResponse(req, res, 200, 'sso native login complete', {
      token: out.token,
      refresh_token: out.refreshToken,
      ...(out.logoutRef === '' ? {} : { sso_logout_ref: out.logoutRef }),
      user: userResponseFromDomain(out.user),
    });
  };

  /**
   * logout нь ref-ээр SSO дээрх session дуусгах URL байгуулна. ref байхгүй/
   * хугацаа дууссан бол ХООСОН мөр (клиент зүгээр орон нутгийн session-оо
   * цэвэрлэнэ) — алдаа БИШ.
   *
   * POST /sso/logout · 200
   */
  logout: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, logoutSchema);
    const ref = body.ref ?? ssoLogoutRefFromCookie(req);
    const url = await this.usecase.logoutUrl(req.ctx, ref);
    newSuccessResponse(req, res, 200, 'sso logout url', { sso_logout_url: url });
  };
}

export const newSSOHandler = (usecase: SSOUsecase): SSOHandler => new SSOHandler(usecase);
