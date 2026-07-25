// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/security нь RASP-style security event-ийн use case давхарга юм:
// нэвтэрсэн хэрэглэгчээс event хүлээн авах (ingest) болон admin-д зориулсан
// жагсаалт (list). actor (userId), IP, user-agent зэрэг нь handler-ээс дамждаг —
// usecase нь зөвхөн баталгаажуулалт + repository руу дамжуулна.

import { badRequest, internalCause } from '../../apperror/index.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type {
  SecurityEventRecord,
  SecurityEventRepository,
} from '../../datasources/repositories/interface/security.js';

/**
 * IngestRequest нь нэг event ингест хийх оролт. userId/ip/userAgent-г handler нь
 * хүсэлтийн контекстээс бөглөнө; kind заавал.
 */
export interface IngestRequest {
  userId: string;
  kind: string;
  severity: string;
  source: string;
  userAgent: string;
  ip: string;
  detail: Record<string, unknown> | null;
}

/** SecurityUsecase нь security event-ийн оролтын хил юм. */
export interface SecurityUsecase {
  /**
   * ingest нь нэг security event бичнэ. userId нь хэрэглэгчийн RLS identity-тэй
   * таарах ёстой (RLS бодлого баталгаажуулна).
   */
  ingest(ctx: Ctx, req: IngestRequest): Promise<void>;
  /** list нь admin-д зориулсан хуудаслагдсан жагсаалт буцаана. */
  list(ctx: Ctx, limit: number, offset: number): Promise<SecurityEventRecord[]>;
}

class SecurityUsecaseImpl implements SecurityUsecase {
  constructor(private readonly repo: SecurityEventRepository) {}

  async ingest(ctx: Ctx, req: IngestRequest): Promise<void> {
    const kind = req.kind.trim();
    if (kind === '') throw badRequest('security event kind is required');
    try {
      await this.repo.ingest(ctx, {
        userId: req.userId,
        kind,
        severity: req.severity.trim(),
        source: req.source.trim(),
        userAgent: req.userAgent,
        ip: req.ip,
        detail: req.detail,
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async list(ctx: Ctx, limit: number, offset: number): Promise<SecurityEventRecord[]> {
    try {
      return await this.repo.list(ctx, limit, offset);
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newSecurityUsecase = (repo: SecurityEventRepository): SecurityUsecase =>
  new SecurityUsecaseImpl(repo);
