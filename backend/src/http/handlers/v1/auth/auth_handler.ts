// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /auth/* HTTP endpoint-ууд — нэвтрэлт (eID · Google) болон session-ийн
// амьдралын мөчлөг. Хэрэглэгчийн ӨӨРИЙН профайлын endpoint-ууд нь ах дүү модуль
// handlers/v1/users-д байрладаг.

import { withUser } from '../../../../pkg/ctx/ctx.js';
import * as logger from '../../../../pkg/logger/logger.js';
import { recordEventSafely, type AuditUsecase } from '../../../../usecases/audit/audit_usecase.js';
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
import {
  accessTokenFromCookie,
  clearSessionCookies,
  issueSessionCookies,
  refreshTokenFromCookie,
} from '../../../cookies.js';
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
  constructor(
    private readonly usecase: AuthUsecase,
    /**
     * auditUC нь hash-chained бүртгэл. null байж болно (audit тохируулаагүй) —
     * тэр үед бичилт чимээгүй алгасагдана.
     */
    private readonly auditUC: AuditUsecase | null = null,
  ) {}

  /**
   * auditLogin нь нэвтрэлтийн амжилтыг бүртгэнэ. BEST-EFFORT: audit бичиж
   * чадаагүй нь нэвтрэлтийг ХЭЗЭЭ Ч унагахгүй (зөвхөн логдоно) — эс бөгөөс
   * audit-ийн саатал бүх хэрэглэгчийг нэвтрүүлэхгүй болгоно.
   *
   * actor нь ШИНЭЭР нэвтэрсэн хэрэглэгч тул ctx-д тухайн identity-г суулгаж
   * дамжуулна.
   */
  private async auditLogin(
    ctx: Parameters<AuthUsecase['eidPoll']>[0],
    userId: string,
    method: string,
  ): Promise<void> {
    await recordEventSafely(
      this.auditUC,
      withUser(ctx, userId),
      `auth.${method}.login`,
      'auth',
      userId,
      { method },
      (err) => {
        logger.errorWithContext(
          ctx,
          'persisted audit write failed (non-fatal)',
          logCtx('auditLogin', { step: 'audit_record', error: logger.errText(err) }),
        );
      },
    );
  }

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

    // COMPLETE үед л шинэ session үүссэн — нэвтрэлтийн амжилтыг бүртгэнэ.
    if (result.state === 'COMPLETE' && result.user) {
      await this.auditLogin(req.ctx, result.user.id, 'eid');
      // SPA-д зориулж токенуудыг httpOnly cookie-д тавина; JSON биед мөн
      // хэвээр буцна (мобайл/m2m клиент өөрчлөгдөхгүй).
      issueSessionCookies(res, result.accessToken, result.refreshToken);
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
      await this.auditLogin(req.ctx, result.login.user.id, 'google');
      issueSessionCookies(res, result.login.accessToken, result.login.refreshToken);
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
    // SPA нь refresh токеныг ЖС-д хадгалдаггүй тул биед байхгүй бол httpOnly
    // cookie-гоос уншина.
    const refreshToken = body.refresh_token ?? refreshTokenFromCookie(req);
    if (refreshToken === '') {
      newErrorResponse(req, res, 400, 'refresh token is required');
      return;
    }
    const result = await this.usecase.refresh(req.ctx, { refreshToken });
    issueSessionCookies(res, result.accessToken, result.refreshToken);
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
    // Cookie-д суурилсан SPA нь токенуудыг биедээ дамжуулж чадахгүй — cookie-оос
    // авна. Ингэснээр refresh jti устаж, access токен deny-list-д орно.
    const refreshToken = body.refresh_token ?? refreshTokenFromCookie(req);
    const accessToken = body.access_token ?? accessTokenFromCookie(req);

    // Токен огт байхгүй (cookie нь хугацаа дуусаж устсан) бол гарах нь
    // ИДЕМПОТЕНТ: клиентийн төлөвийг цэвэрлээд амжилттай хариулна.
    if (refreshToken === '') {
      clearSessionCookies(res);
      newSuccessResponse(req, res, 200, 'logged out successfully');
      return;
    }

    try {
      await this.usecase.logout(req.ctx, { refreshToken, accessToken });
    } finally {
      // Токен хүчингүй байсан ч browser-ийн cookie-г ҮРГЭЛЖ цэвэрлэнэ —
      // эс бөгөөс хэрэглэгч "гарч чадахгүй" гацна.
      clearSessionCookies(res);
    }
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

export function newAuthHandler(
  usecase: AuthUsecase,
  auditUC: AuditUsecase | null = null,
): AuthHandler {
  return new AuthHandler(usecase, auditUC);
}
