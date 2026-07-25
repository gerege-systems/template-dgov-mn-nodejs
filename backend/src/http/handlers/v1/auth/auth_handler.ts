// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /auth/* HTTP endpoint-ууд — нэвтрэлт (eID · Google) болон session-ийн
// амьдралын мөчлөг. Хэрэглэгчийн ӨӨРИЙН профайлын endpoint-ууд нь ах дүү модуль
// handlers/v1/users-д байрладаг.

import * as logger from '../../../../pkg/logger/logger.js';
import type { AuthUsecase } from '../../../../usecases/auth/auth_usecase.js';
import {
  eidPollSchema,
  eidStartByNationalIdSchema,
  eidStartSchema,
  googleLoginSchema,
  logoutSchema,
  refreshSchema,
} from '../../../dto/requests/auth.js';
import {
  eidPollResponse,
  eidStartResponse,
  googleLoginResponse,
  loginResponse,
} from '../../../dto/responses/auth.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const controllerName = 'auth';
const fileName = 'auth_handler.ts';

/** logCtx нь handler логийн нийтлэг талбаруудыг бүтээнэ. */
const logCtx = (method: string, extra: logger.Fields = {}): logger.Fields => ({
  controller: controllerName,
  method,
  file: fileName,
  ...extra,
});

export class AuthHandler {
  constructor(private readonly usecase: AuthUsecase) {}

  /**
   * eidStart нь гадаад eID identity provider дээр QR/deep-link нэвтрэлтийг
   * эхлүүлж, клиент харуулах session мэдээллийг буцаана.
   *
   * POST /auth/eid/start · 200 EIDStartResponse · 500
   */
  eidStart: AsyncHandler = async (req, res) => {
    // Body БАЙХГҮЙ ч зүгээр (CROSS-DEVICE, desktop QR) — тэр үед callbackUrl хоосон.
    const body = optionalBody(req, eidStartSchema);
    const result = await this.usecase.eidStart(req.ctx, body?.callbackUrl ?? '');
    newSuccessResponse(req, res, 200, 'eid session started', eidStartResponse(result));
  };

  /**
   * eidStartByNationalId нь иргэний РД-аар нэвтрэлтийг эхлүүлж, тухайн РД-тэй
   * холбоотой бүртгэлтэй төхөөрөмж рүү баталгаажуулах prompt push хийлгэнэ.
   * QR/device_link шаардлагагүй.
   *
   * POST /auth/eid/start-id · 200 EIDStartResponse · 400 · 422 · 500
   */
  eidStartByNationalId: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, eidStartByNationalIdSchema);
    const result = await this.usecase.eidStartByNationalId(
      req.ctx,
      body.national_id,
      body.callbackUrl ?? '',
    );
    newSuccessResponse(req, res, 200, 'eid session started', eidStartResponse(result));
  };

  /**
   * eidPoll нь session_id-ийн төлвийг IdP-ээс long-poll-оор (≤25с) асууна. state
   * нь RUNNING/COMPLETE/EXPIRED/REFUSED. COMPLETE үед identity-аар хэрэглэгчийг
   * бүртгэж/шинэчилж, access+refresh токен хосыг буцаана.
   *
   * POST /auth/eid/poll · 200 EIDPollResponse · 400 · 422 · 500
   */
  eidPoll: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, eidPollSchema);
    const result = await this.usecase.eidPoll(req.ctx, {
      sessionId: body.session_id,
      googleLinkToken: body.google_link_token ?? '',
    });

    // COMPLETE үед л шинэ session үүссэн — нэвтрэлтийн амжилтыг тэмдэглэнэ.
    // (Hash-chain audit бүртгэл нь `audit` домэйнтэй хамт нэмэгдэнэ.)
    if (result.state === 'COMPLETE' && result.user) {
      logger.infoWithContext(
        req.ctx,
        'eid login success',
        logCtx('eidPoll', { step: 'login_success', user_id: result.user.id, auth_method: 'eid' }),
      );
    }

    newSuccessResponse(req, res, 200, 'eid session state', eidPollResponse(result));
  };

  /**
   * googleLogin нь Google OAuth callback-ийн code-ийг боловсруулна: холбогдсон
   * account бол шууд нэвтрүүлж, эс бол eID-ээр баталгаажуулах link_token буцаана.
   *
   * POST /auth/google · 200 GoogleLoginResponse · 400 · 422 · 500
   */
  googleLogin: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, googleLoginSchema);
    const result = await this.usecase.googleLogin(req.ctx, body.code, body.redirect_uri);

    if (result.linked && result.login) {
      logger.infoWithContext(
        req.ctx,
        'google login success',
        logCtx('googleLogin', {
          step: 'login_success',
          user_id: result.login.user.id,
          auth_method: 'google',
        }),
      );
    }

    newSuccessResponse(req, res, 200, 'google login processed', googleLoginResponse(result));
  };

  /**
   * googleUnlink нь нэвтэрсэн хэрэглэгчийн Google холболтыг САЛГАНА. Холбох нь
   * зөвхөн login урсгалаар хийгддэг.
   *
   * DELETE /auth/google/link · Bearer · 200 · 401
   */
  googleUnlink: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newErrorResponse(req, res, 401, 'request is not authenticated');
      return;
    }
    await this.usecase.unlinkGoogleFromUser(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'google account unlinked');
  };

  /**
   * refresh нь refresh токеныг ЭРГҮҮЛНЭ: шинэ access+refresh хос олгож, хуучин
   * jti-г хүчингүй болгоно (single-use, атом GetDel).
   *
   * POST /auth/refresh · 200 UserResponse+токен · 400 · 401 · 403 · 422
   */
  refresh: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, refreshSchema);
    const result = await this.usecase.refresh(req.ctx, { refreshToken: body.refresh_token });
    newSuccessResponse(req, res, 200, 'token refreshed successfully', loginResponse(result));
  };

  /**
   * logout нь refresh токены jti-г устгана. access_token өгвөл түүний jti-г мөн
   * deny-list-д нэмж, хугацаа дуусахаас өмнө шууд хүчингүй болгоно.
   *
   * POST /auth/logout · 200 · 400 · 401 · 422
   */
  logout: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, logoutSchema);
    await this.usecase.logout(req.ctx, {
      refreshToken: body.refresh_token,
      accessToken: body.access_token ?? '',
    });
    newSuccessResponse(req, res, 200, 'logged out successfully');
  };
}

/**
 * optionalBody нь body БАЙХГҮЙ байж болох endpoint-уудад (eID start-ийн
 * cross-device урсгал) задлан уншина. Body хоосон/буруу бол undefined —
 * баталгаажуулалтын алдаа ШИДЭХГҮЙ, учир нь бүх талбар сонголттой.
 */
function optionalBody<T>(
  req: Request,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): T | undefined {
  const parsed = schema.safeParse(req.body ?? {});
  return parsed.success ? parsed.data : undefined;
}

export function newAuthHandler(usecase: AuthUsecase): AuthHandler {
  return new AuthHandler(usecase);
}
