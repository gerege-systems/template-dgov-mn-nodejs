// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /audit/* HTTP endpoint-ууд — hash-chained audit log-ийн admin гадаргуу.

import type { AuditUsecase } from '../../../../usecases/audit/audit_usecase.js';
import { auditListResponse, auditVerifyResponse } from '../../../dto/responses/audit.js';
import { newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const defaultLimit = 50;
const maxLimit = 200;

/**
 * parseIntDefault нь query параметрийг бүхэл тоо болгоно; хоосон/буруу бол
 * өгөгдмөл утга. Query-ийн буруу утга нь 400 болох ЁСГҮЙ — жагсаалтын
 * хуудаслалт нь тэвчээртэй байх нь клиентэд хамаагүй хялбар.
 */
function parseIntDefault(req: Request, key: string, def: number): number {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

/** queryString нь query параметрийг мөр болгоно (массив/undefined → ""). */
function queryString(req: Request, key: string): string {
  const raw: unknown = req.query[key];
  return typeof raw === 'string' ? raw : '';
}

export class AuditHandler {
  constructor(private readonly usecase: AuditUsecase) {}

  /**
   * list нь audit бүртгэлийг хуудаслан буцаана (хамгийн сүүлийнх эхэндээ).
   * `action` болон `actor` query-гээр шүүнэ.
   *
   * GET /audit · Bearer + admin · 200
   */
  list: AsyncHandler = async (req, res) => {
    let limit = parseIntDefault(req, 'limit', defaultLimit);
    if (limit > maxLimit) limit = maxLimit;
    if (limit <= 0) limit = defaultLimit;
    let offset = parseIntDefault(req, 'offset', 0);
    if (offset < 0) offset = 0;

    const rows = await this.usecase.listEvents(
      req.ctx,
      { action: queryString(req, 'action'), actorUserId: queryString(req, 'actor') },
      limit,
      offset,
    );
    newSuccessResponse(
      req,
      res,
      200,
      'audit entries fetched successfully',
      auditListResponse(rows),
    );
  };

  /**
   * verify нь гинжийг genesis-ээс дахин тооцоолж бүрэн бүтэн байдлыг шалгана.
   * Эвдэрсэн бол эвдрэл гарсан ЭХНИЙ мөрийн id-г буцаана.
   *
   * GET /audit/verify · Bearer + admin · 200
   */
  verify: AsyncHandler = async (req, res) => {
    const result = await this.usecase.verifyChain(req.ctx);
    newSuccessResponse(req, res, 200, 'audit chain verified', auditVerifyResponse(result));
  };
}

export function newAuditHandler(usecase: AuditUsecase): AuditHandler {
  return new AuditHandler(usecase);
}
