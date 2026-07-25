// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { SecurityEventRecord } from '../../../datasources/repositories/interface/security.js';

/**
 * SecurityEventResponse нь security_events-ийн нэг мөр (admin). Хоосон талбарууд
 * (userId/severity/source/userAgent/ip) хариунд ОРОХГҮЙ — Go-ийн `omitempty`-тэй
 * ижил гэрээ.
 */
export interface SecurityEventResponse {
  id: number;
  received_at: Date;
  user_id?: string;
  kind: string;
  severity?: string;
  source?: string;
  user_agent?: string;
  ip?: string;
  detail?: Record<string, unknown>;
}

export function securityEventResponse(rec: SecurityEventRecord): SecurityEventResponse {
  const out: SecurityEventResponse = {
    id: rec.id,
    received_at: rec.receivedAt,
    kind: rec.kind,
  };
  if (rec.userId !== '') out.user_id = rec.userId;
  if (rec.severity !== '') out.severity = rec.severity;
  if (rec.source !== '') out.source = rec.source;
  if (rec.userAgent !== '') out.user_agent = rec.userAgent;
  if (rec.ip !== '') out.ip = rec.ip;
  // Хоосон объект нь Go-ийн nil map шиг унана (omitempty).
  if (rec.detail !== null && Object.keys(rec.detail).length > 0) out.detail = rec.detail;
  return out;
}

export const securityEventListResponse = (rows: SecurityEventRecord[]): SecurityEventResponse[] =>
  rows.map(securityEventResponse);
