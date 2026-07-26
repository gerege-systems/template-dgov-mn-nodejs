// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// user_recovery_codes хүснэгтийн Postgres gateway. Хүснэгт нь per-user тул
// RLS-тэй — query бүр `withRLS` транзакцид identity тавьж явна (нэвтрэхээс
// өмнөх MFA урсгалд "service" үүрэг).

import { internalCause, notFound } from '../../../../apperror/index.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db, Queryable } from '../../../drivers/pg.js';
import type { RecoveryCode, RecoveryCodeRepository } from '../../interface/superadmin.js';

interface CodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Date;
}

const toCode = (r: CodeRow): RecoveryCode => ({
  id: r.id,
  userId: r.user_id,
  codeHash: r.code_hash,
  usedAt: r.used_at,
  createdAt: r.created_at,
});

class PostgresRecoveryCodeRepository implements RecoveryCodeRepository {
  constructor(private readonly db: Db) {}

  async replace(ctx: Ctx, userId: string, hashes: string[]): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        // Дахин үүсгэх нь хуучныг ХҮЧИНГҮЙ болгоно — устгал ба оруулалт НЭГ
        // транзакцид (хагас солигдсон төлөв үүсэхгүй).
        await tx.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
        if (hashes.length === 0) return;
        await tx.query(
          `INSERT INTO user_recovery_codes (user_id, code_hash)
           SELECT $1, unnest($2::text[])`,
          [userId, hashes],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async listActive(ctx: Ctx, userId: string): Promise<RecoveryCode[]> {
    try {
      return await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query<CodeRow>(
          `SELECT id, user_id, code_hash, used_at, created_at
             FROM user_recovery_codes
            WHERE user_id = $1 AND used_at IS NULL
            ORDER BY created_at`,
          [userId],
        );
        return res.rows.map(toCode);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async consume(ctx: Ctx, userId: string, hash: string): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(ctx, async (tx: Queryable) => {
        // `used_at IS NULL` guard + LIMIT 1 — код НЭГ л удаа ажиллана; зэрэг
        // ирсэн хоёр оролдлогын зөвхөн нэг нь амжилттай болно.
        const res = await tx.query(
          `UPDATE user_recovery_codes SET used_at = now()
            WHERE id = (
              SELECT id FROM user_recovery_codes
               WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
               ORDER BY created_at
               FOR UPDATE SKIP LOCKED
               LIMIT 1
            )`,
          [userId, hash],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      throw internalCause(err);
    }
    // Буруу код эсвэл аль хэдийн хэрэглэсэн — ИЖИЛ NotFound (ялгаж хэлэхгүй).
    if (affected === 0) throw notFound('recovery code not found');
  }
}

export const newRecoveryCodeRepository = (db: Db): RecoveryCodeRepository =>
  new PostgresRecoveryCodeRepository(db);
