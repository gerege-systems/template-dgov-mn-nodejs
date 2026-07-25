// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// RASP-style security_events хүснэгтийн Postgres gateway.
//
// ingest нь ХҮСЭЛТИЙН identity дор (users repository-тэй ижил загвар) ажиллана —
// ингэснээр migration 15-ийн бодлого `user_id = app.user_id`-г баталгаажуулж,
// хэрэглэгч ЗӨВХӨН өөрийнхөө тухай event бичиж чадна. list нь admin GUC дор бүх
// event-ийг уншина (хэрэглэгчид уншихыг зөвшөөрөх бодлого БАЙХГҮЙ).

import { withAdmin, type Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type { SecurityEventRecord, SecurityEventRepository } from '../../interface/security.js';

const defaultLimit = 50;

interface SecurityEventRow {
  id: string;
  received_at: Date;
  user_id: string | null;
  kind: string;
  severity: string | null;
  source: string | null;
  user_agent: string | null;
  ip: string | null;
  detail: Record<string, unknown> | null;
}

const toRecord = (r: SecurityEventRow): SecurityEventRecord => ({
  // id нь BIGSERIAL тул драйвер мөрөөр буцаана.
  id: Number.parseInt(r.id, 10),
  receivedAt: r.received_at,
  userId: r.user_id ?? '',
  kind: r.kind,
  severity: r.severity ?? '',
  source: r.source ?? '',
  userAgent: r.user_agent ?? '',
  ip: r.ip ?? '',
  detail: r.detail,
});

/** nullable нь хоосон мөрийг NULL болгоно (uuid/text багана хоёуланд). */
const nullable = (s: string): string | null => (s === '' ? null : s);

class SecurityEventPostgres implements SecurityEventRepository {
  constructor(private readonly db: Db) {}

  /**
   * ingest нь нэг event бичнэ. Хүсэлтийн RLS identity дор — тиймээс хэрэглэгч
   * өөр хүний user_id-тай мөр бичих гэвэл Postgres бодлого татгалзана.
   */
  async ingest(ctx: Ctx, e: Omit<SecurityEventRecord, 'id' | 'receivedAt'>): Promise<void> {
    await this.db.withRLS(ctx, async (tx) => {
      await tx.query(
        `INSERT INTO security_events
             (user_id, kind, severity, source, user_agent, ip, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          nullable(e.userId),
          e.kind,
          nullable(e.severity),
          nullable(e.source),
          nullable(e.userAgent),
          nullable(e.ip),
          // detail нь JSONB — драйвер объектыг өөрөө сериалчилна.
          e.detail ?? {},
        ],
      );
    });
  }

  /** list нь event-үүдийг id буурахаар (шинээс хуучин) хуудаслан буцаана. */
  async list(ctx: Ctx, limit: number, offset: number): Promise<SecurityEventRecord[]> {
    const lim = limit <= 0 ? defaultLimit : limit;
    const off = offset < 0 ? 0 : offset;
    return await this.db.withRLS(withAdmin(ctx, ctx.user?.id ?? ''), async (tx) => {
      const res = await tx.query<SecurityEventRow>(
        `SELECT id, received_at, user_id, kind, severity, source, user_agent, ip, detail
           FROM security_events
          ORDER BY id DESC
          LIMIT $1 OFFSET $2`,
        [lim, off],
      );
      return res.rows.map(toRecord);
    });
  }
}

export const newSecurityEventRepository = (db: Db): SecurityEventRepository =>
  new SecurityEventPostgres(db);
