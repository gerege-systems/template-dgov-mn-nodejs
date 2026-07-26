// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * SecurityEventRecord нь security_events хүснэгтэд бичигдэх (ingest) болон
 * уншигдах (list) нэг мөр юм. Хоосон мөр (`''`) нь DB-д NULL болно.
 */
export interface SecurityEventRecord {
  id: number;
  receivedAt: Date;
  /** userId хоосон бол NULL (тодорхойгүй / нэвтрээгүй). */
  userId: string;
  kind: string;
  severity: string;
  source: string;
  userAgent: string;
  ip: string;
  detail: Record<string, unknown> | null;
}

/**
 * SecurityEventRepository нь RASP-style security_events хүснэгтийн gateway юм.
 * ingest нь нэвтэрсэн ХЭРЭГЛЭГЧИЙН RLS identity дор ажилладаг тул бодлого
 * `user_id = app.user_id`-г баталгаажуулна; list нь admin GUC дор ажиллана.
 */
export interface SecurityEventRepository {
  /** ingest нь нэг security event бичнэ. */
  ingest(ctx: Ctx, e: Omit<SecurityEventRecord, 'id' | 'receivedAt'>): Promise<void>;
  /** list нь event-үүдийг шинээс хуучин рүү хуудаслан буцаана (admin). */
  list(ctx: Ctx, limit: number, offset: number): Promise<SecurityEventRecord[]>;
}
