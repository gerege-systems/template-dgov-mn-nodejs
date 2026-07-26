// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { AuditLogRow } from '../../../datasources/repositories/interface/audit.js';
import type { VerifyResult } from '../../../usecases/audit/audit_usecase.js';

/**
 * AuditLogResponse нь hash-chained audit_log-ийн нэг мөрийг клиентэд (admin)
 * буцаана.
 *
 * chain_hash/prev_hash-г ЗОРИУДААР оруулна: гадны аудитор гинжийг сервертэй
 * харилцахгүйгээр өөрөө дахин тооцоолж шалгах боломжтой байх ёстой — тэр нь
 * "сервер өөрөө өөрийгөө шалгасан" гэсэн эргэлзээг таслана.
 */
export interface AuditLogResponse {
  id: number;
  occurred_at: Date;
  actor_user_id?: string;
  action: string;
  category?: string;
  target?: string;
  request_id?: string;
  metadata?: Record<string, unknown>;
  prev_hash?: string;
  chain_hash: string;
}

const omitEmpty = (s: string): string | undefined => (s === '' ? undefined : s);

/** auditLogResponse нь audit мөрийг хариуны DTO руу буулгана. */
export function auditLogResponse(row: AuditLogRow): AuditLogResponse {
  return {
    id: row.id,
    occurred_at: row.occurredAt,
    actor_user_id: omitEmpty(row.actorUserId),
    action: row.action,
    category: omitEmpty(row.category),
    target: omitEmpty(row.target),
    request_id: omitEmpty(row.requestId),
    metadata: row.metadata ?? undefined,
    prev_hash: omitEmpty(row.prevHash),
    chain_hash: row.chainHash,
  };
}

export const auditListResponse = (rows: AuditLogRow[]): AuditLogResponse[] =>
  rows.map(auditLogResponse);

/** AuditVerifyResponse нь гинжийн бүрэн бүтэн байдлын төлвийг буцаана. */
export interface AuditVerifyResponse {
  ok: boolean;
  broken_id?: number;
}

export function auditVerifyResponse(r: VerifyResult): AuditVerifyResponse {
  // broken_id-г зөвхөн эвдрэл байхад л оруулна (Go-ийн omitempty-тай ижил).
  return r.ok ? { ok: true } : { ok: false, broken_id: r.brokenId };
}
