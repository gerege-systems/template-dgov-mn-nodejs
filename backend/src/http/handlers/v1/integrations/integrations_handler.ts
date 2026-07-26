// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /integrations/* endpoint-ууд — хэрэглэгчийн гуравдагч талын OAuth токеныг
// холбох/жагсаах/салгах/авах.
//
// ⚠️ `GET /:provider/token` нь ШИФРГҮЙ токен буцаадаг тул ЗӨВХӨН server-тал
// (BFF) дуудна — browser руу хэзээ ч гаргах ёсгүй.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { IntegrationsUsecase } from '../../../../usecases/integrations/integrations_usecase.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * connectSchema нь POST /integrations-ийн body. Провайдерын нэрийн НАРИЙН
 * шалгалт (танигдсан жагсаалт) нь usecase давхаргад.
 */
const connectSchema = strictObject({
  provider: z.string().min(1).max(32),
  access_token: z.string().min(1).max(4096),
  refresh_token: z.string().max(4096).optional(),
  /** expires_at_ms нь токены дуусах epoch миллисекунд (0 бол хугацаагүй). */
  expires_at_ms: z.number().int().nonnegative().optional(),
});

const providerParam = (req: Request): string => {
  const raw: unknown = req.params.provider;
  return typeof raw === 'string' ? raw : '';
};

export class IntegrationsHandler {
  constructor(private readonly usecase: IntegrationsUsecase) {}

  /** GET /integrations · Bearer · 200 (ТОКЕНГҮЙ) */
  list: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const items = await this.usecase.list(req.ctx, user.id);
    newSuccessResponse(
      req,
      res,
      200,
      'integrations fetched',
      items.map((p) => ({
        provider: p.provider,
        connected: true,
        ...(p.expiresAt === null ? {} : { expires_at: p.expiresAt.toISOString() }),
        connected_at: p.connectedAt.toISOString(),
      })),
    );
  };

  /** POST /integrations · Bearer · 200 · 400 · 422 */
  connect: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, connectSchema);
    const ms = body.expires_at_ms ?? 0;
    await this.usecase.connect(req.ctx, {
      userId: user.id,
      provider: body.provider,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? '',
      expiresAt: ms > 0 ? new Date(ms) : null,
    });
    newSuccessResponse(req, res, 200, 'integration connected');
  };

  /** GET /integrations/:provider/token · Bearer · 200 · 400 · 404 */
  getToken: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const tok = await this.usecase.token(req.ctx, user.id, providerParam(req));
    newSuccessResponse(req, res, 200, 'token fetched', {
      access_token: tok.accessToken,
      refresh_token: tok.refreshToken,
      expires_at_ms: tok.expiresAt === null ? 0 : tok.expiresAt.getTime(),
    });
  };

  /** DELETE /integrations/:provider · Bearer · 200 (идемпотент) · 400 */
  disconnect: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    await this.usecase.disconnect(req.ctx, user.id, providerParam(req));
    newSuccessResponse(req, res, 200, 'integration disconnected');
  };
}

export const newIntegrationsHandler = (usecase: IntegrationsUsecase): IntegrationsHandler =>
  new IntegrationsHandler(usecase);
