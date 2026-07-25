// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { ChainEntry } from '../../../pkg/audit/chain.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * AuditLogRow нь hash-chained audit_log хүснэгтийн нэг мөрийн уншсан хэлбэр —
 * admin жагсаалт болон гинж шалгахад (verifyChain) ашиглагдана.
 */
export interface AuditLogRow {
  id: number;
  occurredAt: Date;
  actorUserId: string;
  action: string;
  category: string;
  target: string;
  requestId: string;
  metadata: Record<string, unknown> | null;
  prevHash: string;
  chainHash: string;
}

/** AuditListFilter нь admin жагсаалтыг нарийсгана. Хоосон утга нь "шүүлтгүй". */
export interface AuditListFilter {
  /** тухайн action-аар тэнцэл шүүлт */
  action?: string;
  /** тухайн actor-оор тэнцэл шүүлт */
  actorUserId?: string;
}

/** VerifyChainResult нь гинжийн бүрэн бүтэн байдлын шалгалтын үр дүн. */
export interface VerifyChainResult {
  ok: boolean;
  /** ok=false үед эвдэрсэн ЭХНИЙ мөрийн id; эс бөгөөс 0. */
  brokenId: number;
}

/**
 * AuditRepository нь hash-chained, append-only audit_log хүснэгтийн gateway юм.
 * append нь шинэ мөрийн chain_hash-г тооцоолж, гинжийг зөв холбохын тулд
 * бичилтийг ЦУВРАЛЖУУЛНА (advisory lock). audit_log нь admin-only тул
 * бичилт/уншилт нь repository доторх "service"/"admin" GUC дор явна — хүсэлтийн
 * (user) RLS identity-аас ҮЛ ХАМААРНА.
 */
export interface AuditRepository {
  /**
   * append нь нэг үйл явдлыг гинжийн ТӨГСГӨЛД нэмж, бичигдсэн мөрийн chain_hash-г
   * буцаана. Хамгийн сүүлийн мөрийг түгжээтэй уншиж prev_hash болгоно (хоосон
   * гинжид genesis = "").
   */
  append(ctx: Ctx, entry: ChainEntry): Promise<string>;
  /**
   * list нь audit мөрүүдийг id БУУРАХААР (хамгийн сүүлийнх эхэндээ) хуудаслан
   * буцаана. Admin GUC дор ажиллана.
   */
  list(ctx: Ctx, filter: AuditListFilter, limit: number, offset: number): Promise<AuditLogRow[]>;
  /**
   * verifyChain нь гинжийг genesis-ээс эхлэн ДАХИН ТООЦООЛЖ шалгана. Гинж бүрэн
   * бол ok=true; эвдэрсэн бол ok=false + эвдэрсэн ЭХНИЙ мөрийн id.
   */
  verifyChain(ctx: Ctx): Promise<VerifyChainResult>;
}
