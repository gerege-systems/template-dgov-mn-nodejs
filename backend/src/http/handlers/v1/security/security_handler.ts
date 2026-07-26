// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /security/events endpoint-ууд — RASP-style security event-ийг хүлээн авах
// (нэвтэрсэн хэрэглэгч бүрт) болон жагсаах (admin-only). Клиентийн IP-г
// trusted-proxy-aware clientip middleware-ээс, user-agent-г header-ээс авна.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { SecurityUsecase } from '../../../../usecases/security/security_usecase.js';
import { securityEventListResponse } from '../../../dto/responses/security.js';
import { clientIP } from '../../../middlewares/clientip.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const defaultLimit = 50;
const maxLimit = 200;

/**
 * ingestSchema нь POST /security/events-ийн body. kind заавал (жишээ:
 * "rasp.jailbreak", "integrity.tamper", "anomaly.timing"); severity сонголттой
 * (low/medium/high/critical). detail нь PII-гүй нэмэлт нотолгоо.
 */
const ingestSchema = strictObject({
  kind: z.string().min(1).max(80),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  source: z.string().max(80).optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

/** parseIntDefault нь query-г бүхэл тоо болгоно; буруу бол өгөгдмөл (400 БИШ). */
function parseIntDefault(req: Request, key: string, def: number): number {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

export class SecurityHandler {
  constructor(private readonly usecase: SecurityUsecase) {}

  /**
   * ingest нь нэг security event хүлээн авна. Хэрэглэгч ЗӨВХӨН өөрийнхөө тухай
   * event илгээж чадна — user_id-г серверийн JWT-ээс авдаг тул клиент өөрчилж
   * чадахгүй, RLS бодлого нь бас баталгаажуулна.
   *
   * POST /security/events · Bearer · 202 · 401 · 422
   */
  ingest: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newErrorResponse(req, res, 401, 'request is not authenticated');
      return;
    }
    const body = decodeBody(req, ingestSchema);
    await this.usecase.ingest(req.ctx, {
      userId: user.id,
      kind: body.kind,
      severity: body.severity ?? '',
      source: body.source ?? '',
      userAgent: req.get('user-agent') ?? '',
      ip: req.clientIp ?? clientIP(req),
      detail: body.detail ?? null,
    });
    newSuccessResponse(req, res, 202, 'security event recorded');
  };

  /**
   * list нь event-үүдийг хуудаслан буцаана (шинээс хуучин).
   *
   * GET /security/events · Bearer + admin · 200 · 401 · 403
   */
  list: AsyncHandler = async (req, res) => {
    let limit = parseIntDefault(req, 'limit', defaultLimit);
    if (limit > maxLimit) limit = maxLimit;
    if (limit <= 0) limit = defaultLimit;
    let offset = parseIntDefault(req, 'offset', 0);
    if (offset < 0) offset = 0;

    const rows = await this.usecase.list(req.ctx, limit, offset);
    newSuccessResponse(
      req,
      res,
      200,
      'security events fetched successfully',
      securityEventListResponse(rows),
    );
  };
}

export const newSecurityHandler = (usecase: SecurityUsecase): SecurityHandler =>
  new SecurityHandler(usecase);
