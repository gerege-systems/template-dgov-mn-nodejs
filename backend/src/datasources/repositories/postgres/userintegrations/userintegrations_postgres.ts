// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// user_integrations хүснэгтийн Postgres gateway.
//
// Хэрэглэгч-тус-бүрийн МЭДРЭМТГИЙ өгөгдөл (гуравдагч талын OAuth токен) тул
// query бүр RLS транзакцаар ажиллана — identity байхгүй бол бодлого бүх мөрийг
// хаана (fail-closed).

import { internalCause } from '../../../../apperror/index.js';
import type { UserIntegration } from '../../../../domain/user_integration.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type {
  NewUserIntegration,
  UserIntegrationRepository,
} from '../../interface/user_integration.js';

const columns =
  'id, user_id, provider, access_token, refresh_token, expires_at, created_at, updated_at';

interface Row {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

const toDomain = (r: Row): UserIntegration => ({
  id: r.id,
  userId: r.user_id,
  provider: r.provider,
  accessToken: r.access_token,
  refreshToken: r.refresh_token ?? '',
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

class UserIntegrationsPostgres implements UserIntegrationRepository {
  constructor(private readonly db: Db) {}

  async upsert(ctx: Ctx, input: NewUserIntegration): Promise<UserIntegration> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<Row>(
          `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, expires_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, provider) DO UPDATE
              SET access_token = EXCLUDED.access_token,
                  refresh_token = EXCLUDED.refresh_token,
                  expires_at = EXCLUDED.expires_at,
                  updated_at = now()
           RETURNING ${columns}`,
          [
            input.userId,
            input.provider,
            input.accessToken,
            // Хоосон refresh token нь NULL — зарим провайдер өгдөггүй.
            input.refreshToken === '' ? null : input.refreshToken,
            input.expiresAt,
          ],
        );
        const row = res.rows[0];
        if (!row) throw new Error('upsert user integration: no row returned');
        return toDomain(row);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async listByUser(ctx: Ctx, userId: string): Promise<UserIntegration[]> {
    try {
      return await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<Row>(
          `SELECT ${columns} FROM user_integrations WHERE user_id = $1 ORDER BY created_at`,
          [userId],
        );
        return res.rows.map(toDomain);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async deleteByUserAndProvider(ctx: Ctx, userId: string, provider: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        await tx.query(`DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2`, [
          userId,
          provider,
        ]);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newUserIntegrationsRepository = (db: Db): UserIntegrationRepository =>
  new UserIntegrationsPostgres(db);
