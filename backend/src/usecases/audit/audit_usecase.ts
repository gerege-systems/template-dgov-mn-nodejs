// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/audit нь hash-chained, append-only audit log-ийн use case давхарга:
// үйл явдал бичих (recordEvent), admin жагсаалт (listEvents) болон гинжийн бүрэн
// бүтэн байдлыг шалгах (verifyChain).
//
// Бичих actor нь хүсэлтийн RLS identity-аас АВТОМАТААР уншигдана; request_id-г
// контекстээс гаргана — иймээс дуудагч тэднийг мартаж чадахгүй.

import { badRequest } from '../../apperror/index.js';
import type {
  AuditListFilter,
  AuditLogRow,
  AuditRepository,
} from '../../datasources/repositories/interface/audit.js';
import { identityOf, type Ctx } from '../../pkg/ctx/ctx.js';

/** VerifyResult нь verifyChain-ийн үр дүн. */
export interface VerifyResult {
  ok: boolean;
  /** ok=false үед эвдэрсэн ЭХНИЙ мөрийн id. */
  brokenId: number;
}

export interface AuditUsecase {
  /**
   * recordEvent нь нэг audit үйл явдлыг гинжид нэмнэ. actor-г хүсэлтийн RLS
   * identity-аас, request_id-г контекстээс уншина.
   *
   * Бичих алдааг БУЦААНА — дуудагчид (нэвтрэлт зэрэг гол урсгалд) үүнийг
   * best-effort / non-fatal-аар хэрэглэнэ: audit бичиж чадаагүй нь хэрэглэгчийн
   * үйлдлийг унагах шалтгаан биш, гэхдээ чимээгүй өнгөрөх ч ёсгүй (логдоно).
   */
  recordEvent(
    ctx: Ctx,
    action: string,
    category: string,
    target: string,
    metadata: Record<string, unknown> | null,
  ): Promise<void>;
  /** listEvents нь admin-д зориулсан хуудаслагдсан жагсаалт буцаана. */
  listEvents(
    ctx: Ctx,
    filter: AuditListFilter,
    limit: number,
    offset: number,
  ): Promise<AuditLogRow[]>;
  /** verifyChain нь гинжийн бүрэн бүтэн байдлыг буцаана (ok + эвдэрсэн эхний мөр). */
  verifyChain(ctx: Ctx): Promise<VerifyResult>;
}

class AuditUsecaseImpl implements AuditUsecase {
  constructor(private readonly repo: AuditRepository) {}

  async recordEvent(
    ctx: Ctx,
    action: string,
    category: string,
    target: string,
    metadata: Record<string, unknown> | null,
  ): Promise<void> {
    if (action === '') throw badRequest('audit action is required');

    await this.repo.append(ctx, {
      // Цагийг ЭНД (JS-д) гаргана — SQL `now()` хэрэглэвэл DB нь микросекунд
      // бичиж, драйвер миллисекундээр уншиж, verifyChain дахин тооцоолохдоо ӨӨР
      // hash гаргах тул гэмтээгүй гинж "эвдэрсэн" гэж харагдана.
      occurredAt: new Date(),
      actorUserId: identityOf(ctx)?.userId ?? '',
      action,
      category,
      target,
      requestId: ctx.requestId ?? '',
      metadata,
    });
  }

  async listEvents(
    ctx: Ctx,
    filter: AuditListFilter,
    limit: number,
    offset: number,
  ): Promise<AuditLogRow[]> {
    return this.repo.list(ctx, filter, limit, offset);
  }

  async verifyChain(ctx: Ctx): Promise<VerifyResult> {
    const res = await this.repo.verifyChain(ctx);
    return { ok: res.ok, brokenId: res.brokenId };
  }
}

export function newAuditUsecase(repo: AuditRepository): AuditUsecase {
  return new AuditUsecaseImpl(repo);
}

/**
 * recordEventSafely нь audit бичилтийг NON-FATAL-аар хийнэ — нэвтрэлт/RBAC зэрэг
 * гол урсгалуудад ашиглана. Алдааг залгихгүй, дуудагчийн өгсөн logger-ээр
 * тэмдэглэнэ.
 *
 * Яагаад тусдаа функц вэ: handler бүрт try/catch давхардуулбал нэг өдөр хэн нэгэн
 * `await` мартаж, audit бичилтийн алдаа баригдаагүй promise болж процессийг
 * унагах эрсдэлтэй. Энэ нь тэр хэвшлийг нэг газар бэхжүүлнэ.
 */
export async function recordEventSafely(
  uc: AuditUsecase | null,
  ctx: Ctx,
  action: string,
  category: string,
  target: string,
  metadata: Record<string, unknown> | null,
  onError: (err: unknown) => void,
): Promise<void> {
  if (!uc) return;
  try {
    await uc.recordEvent(ctx, action, category, target, metadata);
  } catch (err) {
    onError(err);
  }
}
