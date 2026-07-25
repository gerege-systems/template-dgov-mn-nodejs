// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// superadmin_invites хүснэгтийн Postgres gateway — super admin болох
// и-мэйлийн allow-list. Системийн тохиргооны хүснэгт тул RLS-гүй; хандалтыг
// route давхарга (RequireSuperAdmin) болон onboarding урсгал шийднэ.

import { conflict, internalCause, notFound } from '../../../../apperror/index.js';
import { normalizeInviteEmail } from '../../../../domain/superadmin_account.js';
import type { SuperadminInvite } from '../../../../domain/superadmin_account.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import { isUniqueViolation } from '../../../drivers/pg.js';
import type { SuperadminInviteRepository } from '../../interface/superadmin.js';

const inviteColumns = 'email, invited_by, created_at, accepted_at';

interface InviteRow {
  email: string;
  invited_by: string;
  created_at: Date;
  accepted_at: Date | null;
}

const toInvite = (r: InviteRow): SuperadminInvite => ({
  email: r.email,
  invitedBy: r.invited_by,
  createdAt: r.created_at,
  acceptedAt: r.accepted_at,
});

class PostgresSuperadminInviteRepository implements SuperadminInviteRepository {
  constructor(private readonly db: Db) {}

  /** list нь бүх урилгыг ШИНЭ нь эхэндээ буцаана. */
  async list(ctx: Ctx): Promise<SuperadminInvite[]> {
    try {
      const res = await this.db.query<InviteRow>(
        ctx,
        `SELECT ${inviteColumns} FROM superadmin_invites ORDER BY created_at DESC`,
      );
      return res.rows.map(toInvite);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getByEmail(ctx: Ctx, email: string): Promise<SuperadminInvite> {
    let row: InviteRow | undefined;
    try {
      const res = await this.db.query<InviteRow>(
        ctx,
        `SELECT ${inviteColumns} FROM superadmin_invites WHERE email = $1`,
        [normalizeInviteEmail(email)],
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('superadmin invite not found');
    return toInvite(row);
  }

  async create(ctx: Ctx, email: string, invitedBy: string): Promise<SuperadminInvite> {
    try {
      const res = await this.db.query<InviteRow>(
        ctx,
        `INSERT INTO superadmin_invites(email, invited_by) VALUES ($1, $2)
         RETURNING ${inviteColumns}`,
        [normalizeInviteEmail(email), invitedBy],
      );
      const row = res.rows[0];
      if (!row) throw new Error('superadmin invite insert returned no row');
      return toInvite(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('this email has already been invited');
      throw internalCause(err);
    }
  }

  async deleteInvite(ctx: Ctx, email: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, 'DELETE FROM superadmin_invites WHERE email = $1', [
        normalizeInviteEmail(email),
      ]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('superadmin invite not found');
  }

  /**
   * markAccepted нь урилгыг ашигласан гэж тэмдэглэнэ. `accepted_at IS NULL`
   * нөхцөл нь ДАХИН ашиглахаас сэргийлнэ (нэг урилга = нэг super admin).
   */
  async markAccepted(ctx: Ctx, email: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(
        ctx,
        `UPDATE superadmin_invites SET accepted_at = now()
          WHERE email = $1 AND accepted_at IS NULL`,
        [normalizeInviteEmail(email)],
      );
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('superadmin invite not found or already accepted');
  }
}

export const newSuperadminInviteRepository = (db: Db): SuperadminInviteRepository =>
  new PostgresSuperadminInviteRepository(db);
