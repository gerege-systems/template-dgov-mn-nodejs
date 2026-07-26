// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Иргэний SSO OAuth токенуудыг sso_tokens хүснэгтэд AES-GCM-ээр шифрлэж
// хадгална (SSO eID proxy-д зориулж).
//
// RLS транзакцаар ажиллана: SSO callback дээр service, eID унших/refresh дээр
// хэрэглэгчийн өөрийн identity. Багана нь ЗӨВХӨН шифр текст агуулна.

import { internalCause } from '../../../../apperror/index.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Cipher } from '../../../../pkg/crypto/cipher.js';
import type { Db } from '../../../drivers/pg.js';
import { ErrSSOTokenNotFound, type SSOToken } from '../../../../domain/sso_token.js';
import type { SSOTokenRepository } from '../../interface/ssotoken.js';

interface Row {
  access_token_enc: string;
  refresh_token_enc: string;
  access_expires_at: Date;
}

class SSOTokenPostgres implements SSOTokenRepository {
  constructor(
    private readonly db: Db,
    private readonly cipher: Cipher,
  ) {}

  async upsert(ctx: Ctx, userId: string, tok: SSOToken): Promise<void> {
    try {
      const accessEnc = this.cipher.encrypt(tok.accessToken);
      const refreshEnc = this.cipher.encrypt(tok.refreshToken);
      await this.db.withRLS(ctx, async (tx) => {
        await tx.query(
          `INSERT INTO sso_tokens (user_id, access_token_enc, refresh_token_enc, access_expires_at, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE SET
               access_token_enc  = EXCLUDED.access_token_enc,
               refresh_token_enc = EXCLUDED.refresh_token_enc,
               access_expires_at = EXCLUDED.access_expires_at,
               updated_at        = now()`,
          [userId, accessEnc, refreshEnc, tok.accessExpiresAt],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async get(ctx: Ctx, userId: string): Promise<SSOToken> {
    let row: Row | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<Row>(
          `SELECT access_token_enc, refresh_token_enc, access_expires_at
             FROM sso_tokens WHERE user_id = $1`,
          [userId],
        );
        return res.rows[0];
      });
    } catch (err) {
      throw internalCause(err);
    }
    // Мөр байхгүй нь АЛДАА БИШ — "дахин нэвтрэх" төлөв (дуудагч 401 болгоно).
    if (!row) throw new ErrSSOTokenNotFound();
    try {
      return {
        accessToken: this.cipher.decrypt(row.access_token_enc),
        refreshToken: this.cipher.decrypt(row.refresh_token_enc),
        accessExpiresAt: row.access_expires_at,
      };
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newSSOTokenRepository = (db: Db, cipher: Cipher): SSOTokenRepository =>
  new SSOTokenPostgres(db, cipher);
