// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// OIDC provider-ийн login/consent/logout-ийн HTTP давхарга. Frontend-ийн
// `/oauth/login`, `/oauth/consent`, `/oauth/logout` хуудсууд эдгээрийг дуудаж
// challenge-ыг зохицуулна. Accept endpoint-ууд НЭВТЭРСЭН иргэнийг шаардана;
// subject нь платформын user ID.
//
// ⚠️ ГАДААД ГЭРЭЭ: get login/consent-ийн `data` талбарууд нь Go хувилбарын
// struct-ийн нэрстэй (PascalCase) ЯГ ижил — frontend түүгээр уншдаг тул
// snake_case руу "цэгцлэх" нь эвдрэл болно.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { ProviderUsecase } from '../../../../usecases/provider/provider_usecase.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/** challengeSchema нь бүх accept/reject хүсэлтийн нийтлэг бие. */
const challengeSchema = strictObject({
  login_challenge: z.string().max(512).optional(),
  consent_challenge: z.string().max(512).optional(),
  logout_challenge: z.string().max(512).optional(),
  grant_scope: z.array(z.string().max(120)).max(50).optional(),
  reason: z.string().max(500).optional(),
});

const queryValue = (req: Request, key: string): string => {
  const raw: unknown = req.query[key];
  return typeof raw === 'string' ? raw : '';
};

export class ProviderHandler {
  constructor(private readonly usecase: ProviderUsecase) {}

  /** GET /provider/login?login_challenge=… — login хуудсанд харуулах товч. */
  getLogin: AsyncHandler = async (req, res) => {
    const info = await this.usecase.getLogin(req.ctx, queryValue(req, 'login_challenge'));
    newSuccessResponse(req, res, 200, 'ok', {
      Challenge: info.challenge,
      ClientID: info.clientId,
      ClientName: info.clientName,
      RequestedScope: info.requestedScope,
      Subject: info.subject,
      Skip: info.skip,
    });
  };

  /**
   * POST /provider/login/accept — нэвтэрсэн иргэнээр login challenge-ыг
   * баталгаажуулна (subject = платформын user ID). Auth шаардана.
   */
  acceptLogin: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, challengeSchema);
    const redirectTo = await this.usecase.acceptLogin(req.ctx, user.id, body.login_challenge ?? '');
    newSuccessResponse(req, res, 200, 'ok', { redirect_to: redirectTo });
  };

  /** POST /provider/login/reject — нэвтрэлтийг цуцална. */
  rejectLogin: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, challengeSchema);
    const redirectTo = await this.usecase.rejectLogin(
      req.ctx,
      body.login_challenge ?? '',
      body.reason ?? '',
    );
    newSuccessResponse(req, res, 200, 'ok', { redirect_to: redirectTo });
  };

  /** GET /provider/consent?consent_challenge=… — consent хуудсанд харуулах. */
  getConsent: AsyncHandler = async (req, res) => {
    const info = await this.usecase.getConsent(req.ctx, queryValue(req, 'consent_challenge'));
    newSuccessResponse(req, res, 200, 'ok', {
      Challenge: info.challenge,
      ClientID: info.clientId,
      ClientName: info.clientName,
      Subject: info.subject,
      RequestedScope: info.requestedScope,
      Skip: info.skip,
    });
  };

  /**
   * POST /provider/consent/accept — олгосон scope-оор consent-ыг баталгаажуулна.
   * Auth шаардана; challenge дээрх subject-тэй таарахыг usecase шалгана.
   */
  acceptConsent: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, challengeSchema);
    const redirectTo = await this.usecase.acceptConsent(
      req.ctx,
      user.id,
      body.consent_challenge ?? '',
      body.grant_scope ?? [],
    );
    newSuccessResponse(req, res, 200, 'ok', { redirect_to: redirectTo });
  };

  /** POST /provider/consent/reject — зөвшөөрлийг цуцална. */
  rejectConsent: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, challengeSchema);
    const redirectTo = await this.usecase.rejectConsent(
      req.ctx,
      body.consent_challenge ?? '',
      body.reason ?? '',
    );
    newSuccessResponse(req, res, 200, 'ok', { redirect_to: redirectTo });
  };

  /** POST /provider/logout/accept — RP-initiated logout-ыг баталгаажуулна. */
  acceptLogout: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, challengeSchema);
    const redirectTo = await this.usecase.acceptLogout(req.ctx, body.logout_challenge ?? '');
    newSuccessResponse(req, res, 200, 'ok', { redirect_to: redirectTo });
  };
}

export const newProviderHandler = (usecase: ProviderUsecase): ProviderHandler =>
  new ProviderHandler(usecase);
