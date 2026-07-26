// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// id_token гарын үсгийн түлхүүрүүдийн Postgres gateway. oauth_clients-ийн адил
// системийн тохиргоо тул RLS-гүй; хувийн түлхүүр нь мөрөндөө шифрлэгдсэн
// байдлаар хамгаалагдана (AES-256-GCM, INTEGRATION_ENC_KEY).

import { internalCause, notFound } from '../../../../apperror/index.js';
import type { SigningKey } from '../../../../domain/oauth.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type { OAuthKeyRepository } from '../../interface/oauth.js';

const keyColumns = 'kid, alg, private_key_enc, public_jwk, active, created_at, retired_at';

interface KeyRow {
  kid: string;
  alg: string;
  private_key_enc: string;
  public_jwk: Record<string, unknown>;
  active: boolean;
  created_at: Date;
  retired_at: Date | null;
}

const toKey = (r: KeyRow): SigningKey => ({
  kid: r.kid,
  alg: r.alg,
  privateKeyEnc: r.private_key_enc,
  publicJwk: r.public_jwk,
  active: r.active,
  createdAt: r.created_at,
  retiredAt: r.retired_at,
});

class PostgresOAuthKeyRepository implements OAuthKeyRepository {
  constructor(private readonly db: Db) {}

  async active(ctx: Ctx): Promise<SigningKey> {
    let row: KeyRow | undefined;
    try {
      const res = await this.db.query<KeyRow>(
        ctx,
        `SELECT ${keyColumns} FROM oauth_signing_keys WHERE active LIMIT 1`,
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    // Дуудагч (KeyManager.ensureKey) үүнийг барьж шинэ түлхүүр үүсгэнэ.
    if (!row) throw notFound('no active signing key');
    return toKey(row);
  }

  /**
   * all нь JWKS-д нийтлэх бүх түлхүүрийг буцаана — retire хийсэн нь ч ОРНО,
   * эс бөгөөс тэдгээрээр гарын үсэг зурсан, хараахан хүчинтэй id_token-ууд
   * шалгагдахаа болино.
   */
  async all(ctx: Ctx): Promise<SigningKey[]> {
    try {
      const res = await this.db.query<KeyRow>(
        ctx,
        `SELECT ${keyColumns} FROM oauth_signing_keys ORDER BY active DESC, created_at DESC`,
      );
      return res.rows.map(toKey);
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * insert нь шинэ түлхүүр нэмнэ. active=true-тэй нэмэхээс ӨМНӨ дуудагч
   * хуучныг retireActive хийсэн байх ёстой (нэг идэвхтэй түлхүүрийн unique
   * индекс хамгаална).
   */
  async insert(ctx: Ctx, k: Omit<SigningKey, 'createdAt' | 'retiredAt'>): Promise<void> {
    try {
      await this.db.query(
        ctx,
        `INSERT INTO oauth_signing_keys (kid, alg, private_key_enc, public_jwk, active)
         VALUES ($1, $2, $3, $4, $5)`,
        [k.kid, k.alg, k.privateKeyEnc, JSON.stringify(k.publicJwk), k.active],
      );
    } catch (err) {
      throw internalCause(err);
    }
  }

  /** retireActive нь идэвхтэй түлхүүрийг тэтгэвэрт гаргана (JWKS-д ҮЛДЭНЭ). */
  async retireActive(ctx: Ctx): Promise<void> {
    try {
      await this.db.query(
        ctx,
        'UPDATE oauth_signing_keys SET active = false, retired_at = now() WHERE active',
      );
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newOAuthKeyRepository = (db: Db): OAuthKeyRepository =>
  new PostgresOAuthKeyRepository(db);
