// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// superadmin_accounts (super admin-ы satellite бүртгэл) хүснэгтийн READ
// gateway. Хүснэгт нь per-user тул RLS-тэй — query нь `withRLS` транзакцид
// identity тавьж явна (нэвтрэхээс өмнөх MFA урсгалд "service" үүрэг).
//
// Бичилт нь users repository-гийн `upsertSuperAdmin`-д (onboarding-ийн төгсгөл)
// нэг транзакцид хийгддэг — энд зөвхөн уншилт.

import { internalCause, notFound } from '../../../../apperror/index.js';
import type { SuperadminAccount } from '../../../../domain/superadmin_account.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db, Queryable } from '../../../drivers/pg.js';
import type { SuperadminAccountRepository } from '../../interface/users.js';

const accountColumns = `user_id, civil_id, national_id, email_verified, mfa_enabled,
    totp_secret, invited_by, onboarded_at, created_at, updated_at`;

interface AccountRow {
  user_id: string;
  civil_id: string | null;
  national_id: string | null;
  email_verified: boolean;
  mfa_enabled: boolean;
  totp_secret: string | null;
  invited_by: string | null;
  onboarded_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

const toAccount = (r: AccountRow): SuperadminAccount => ({
  userId: r.user_id,
  civilId: r.civil_id ?? '',
  nationalId: r.national_id ?? '',
  emailVerified: r.email_verified,
  mfaEnabled: r.mfa_enabled,
  totpSecret: r.totp_secret ?? '',
  invitedBy: r.invited_by ?? '',
  onboardedAt: r.onboarded_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

class PostgresSuperadminAccountRepository implements SuperadminAccountRepository {
  constructor(private readonly db: Db) {}

  async get(ctx: Ctx, userId: string): Promise<SuperadminAccount> {
    let row: AccountRow | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query<AccountRow>(
          `SELECT ${accountColumns} FROM superadmin_accounts WHERE user_id = $1`,
          [userId],
        );
        return res.rows[0];
      });
    } catch (err) {
      throw internalCause(err);
    }
    // Байхгүй бол MFA урсгал fail-closed болно (нэвтрүүлэхгүй).
    if (!row) throw notFound('superadmin account not found');
    return toAccount(row);
  }
}

export const newSuperadminAccountRepository = (db: Db): SuperadminAccountRepository =>
  new PostgresSuperadminAccountRepository(db);
