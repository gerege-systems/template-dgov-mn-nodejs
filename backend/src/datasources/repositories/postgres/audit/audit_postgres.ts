// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// hash-chained, append-only audit_log хүснэгтийн Postgres gateway.
//
// audit_log нь RLS-тэй (migration 15): "service" role бичиж/уншиж, "admin" role
// уншиж чадна. Хүсэлтийн (user) identity-аас ҮЛ ХАМААРАН энэ давхарга өөрөө
// шаардлагатай GUC-ийг тавина — audit нь нэвтрээгүй урсгалын үйл явдлыг ч
// бүртгэх ёстой (жишээ нь eID нэвтрэлт).

import { internalCause } from '../../../../apperror/index.js';
import { computeChainHash, type ChainEntry } from '../../../../pkg/audit/chain.js';
import { withAdmin, withService, type Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db, Queryable } from '../../../drivers/pg.js';
import type {
  AuditListFilter,
  AuditLogRow,
  AuditRepository,
  VerifyChainResult,
} from '../../interface/audit.js';

/**
 * auditChainLockKey нь гинжийн бичилтийг цувралжуулах advisory lock-ийн түлхүүр.
 * ХОЁР зэрэгцээ append ижил prev_hash уншвал гинж хуваагдана (хоёр мөр ижил
 * prev-тэй) — тэр нь verifyChain-д "эвдэрсэн" болж харагдана.
 */
const auditChainLockKey = 778899;

const defaultLimit = 50;

const auditColumns =
  'id, occurred_at, actor_user_id, action, category, target, request_id, metadata, prev_hash, chain_hash';

interface AuditRow {
  id: string;
  occurred_at: Date;
  actor_user_id: string | null;
  action: string;
  category: string | null;
  target: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
  prev_hash: string | null;
  chain_hash: string;
}

const toRow = (r: AuditRow): AuditLogRow => ({
  // id нь BIGSERIAL тул драйвер мөрөөр буцаана.
  id: Number.parseInt(r.id, 10),
  occurredAt: r.occurred_at,
  actorUserId: r.actor_user_id ?? '',
  action: r.action,
  category: r.category ?? '',
  target: r.target ?? '',
  requestId: r.request_id ?? '',
  metadata: r.metadata,
  prevHash: r.prev_hash ?? '',
  chainHash: r.chain_hash,
});

/** nullIfEmpty нь хоосон мөрийг SQL NULL болгоно (nullable багануудад). */
const nullIfEmpty = (s: string): string | null => (s === '' ? null : s);

class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  /**
   * append нь гинжийн төгсгөлд нэмнэ. Дараалал:
   *   1. "service" GUC (бичих эрх)
   *   2. advisory XACT lock — зэрэгцээ бичилтийг цувралжуулна
   *   3. хамгийн сүүлийн chain_hash-г prev болгож уншина (хоосон бол genesis = "")
   *   4. chain_hash тооцоолж INSERT
   * Бүгд НЭГ транзакцид — lock нь commit дээр автоматаар тавигдана.
   */
  async append(ctx: Ctx, entry: ChainEntry): Promise<string> {
    if (Number.isNaN(entry.occurredAt.getTime())) {
      throw internalCause(new Error('audit append: occurred_at is required'));
    }
    try {
      return await this.db.withRLS(withService(ctx), async (tx: Queryable) => {
        await tx.query('SELECT pg_advisory_xact_lock($1)', [auditChainLockKey]);

        const prevRes = await tx.query<{ chain_hash: string }>(
          'SELECT chain_hash FROM audit_log ORDER BY id DESC LIMIT 1',
        );
        const prevHash = prevRes.rows[0]?.chain_hash ?? '';

        const chainHash = computeChainHash(prevHash, entry);

        await tx.query(
          `INSERT INTO audit_log
             (occurred_at, actor_user_id, action, category, target, request_id, metadata, prev_hash, chain_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            entry.occurredAt,
            nullIfEmpty(entry.actorUserId),
            entry.action,
            nullIfEmpty(entry.category),
            nullIfEmpty(entry.target),
            nullIfEmpty(entry.requestId),
            // metadata нь jsonb — драйвер объектыг өөрөө JSON болгоно.
            entry.metadata,
            nullIfEmpty(prevHash),
            chainHash,
          ],
        );
        return chainHash;
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async list(
    ctx: Ctx,
    filter: AuditListFilter,
    limit: number,
    offset: number,
  ): Promise<AuditLogRow[]> {
    const cappedLimit = limit <= 0 ? defaultLimit : limit;
    const safeOffset = offset < 0 ? 0 : offset;

    const clauses: string[] = [];
    const args: unknown[] = [];
    if (filter.action) {
      args.push(filter.action);
      clauses.push(`action = $${args.length}`);
    }
    if (filter.actorUserId) {
      args.push(filter.actorUserId);
      clauses.push(`actor_user_id = $${args.length}`);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    args.push(cappedLimit, safeOffset);

    try {
      // Уншилт "admin" GUC дор — audit нь admin-only гадаргуу.
      return await this.db.withRLS(withAdmin(ctx, ctx.user?.id ?? ''), async (tx) => {
        const res = await tx.query<AuditRow>(
          `SELECT ${auditColumns} FROM audit_log${where}
            ORDER BY id DESC
            LIMIT $${args.length - 1} OFFSET $${args.length}`,
          args,
        );
        return res.rows.map(toRow);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * verifyChain нь genesis-ээс эхлэн мөр бүрийн hash-г ДАХИН тооцоолж, prev_hash
   * холболтыг шалгана. Хоёр төрлийн эвдрэлийг ялгаж барина:
   *   - prev_hash нь өмнөх мөрийн chain_hash-тай таарахгүй (мөр устсан/оруулсан);
   *   - дахин тооцоолсон hash нь хадгалагдсантай таарахгүй (агуулга засварласан).
   */
  async verifyChain(ctx: Ctx): Promise<VerifyChainResult> {
    try {
      return await this.db.withRLS(withAdmin(ctx, ctx.user?.id ?? ''), async (tx) => {
        const res = await tx.query<AuditRow>(
          `SELECT ${auditColumns} FROM audit_log ORDER BY id ASC`,
        );
        let prev = ''; // genesis
        for (const raw of res.rows) {
          const row = toRow(raw);
          if (row.prevHash !== prev) return { ok: false, brokenId: row.id };

          const computed = computeChainHash(prev, {
            occurredAt: row.occurredAt,
            actorUserId: row.actorUserId,
            action: row.action,
            category: row.category,
            target: row.target,
            requestId: row.requestId,
            metadata: row.metadata,
          });
          if (computed !== row.chainHash) return { ok: false, brokenId: row.id };

          prev = row.chainHash;
        }
        return { ok: true, brokenId: 0 };
      });
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export function newAuditRepository(db: Db): AuditRepository {
  return new PostgresAuditRepository(db);
}
