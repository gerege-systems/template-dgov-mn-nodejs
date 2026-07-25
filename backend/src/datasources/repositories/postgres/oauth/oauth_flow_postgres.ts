// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// authorize урсгалын түр төлөв (challenge, санагдсан consent, authorization
// code, access/refresh token)-ийн Postgres gateway.
//
// Эдгээр хүснэгтүүд RLS-тэй бөгөөд протоколын endpoint-ууд НЭВТРЭХЭЭС ӨМНӨ
// ажилладаг тул query бүр `withRLS` транзакцаар (ихэвчлэн service үүргээр) явна.

import { badRequest, DomainError, internalCause, notFound } from '../../../../apperror/index.js';
import type {
  OAuthAccessToken,
  OAuthAuthCode,
  OAuthChallenge,
  OAuthRefreshToken,
} from '../../../../domain/oauth.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db, Queryable } from '../../../drivers/pg.js';
import type { NewOAuthChallenge, OAuthFlowRepository } from '../../interface/oauth.js';

const challengeColumns = `challenge, kind, client_id, subject, requested_scopes, granted_scopes,
    redirect_uri, state, nonce, response_type, code_challenge, code_challenge_method,
    prompt, post_logout_redirect_uri, skip, decided_at, expires_at, created_at`;

interface ChallengeRow {
  challenge: string;
  kind: string;
  client_id: string | null;
  subject: string | null;
  requested_scopes: string[] | null;
  granted_scopes: string[] | null;
  redirect_uri: string;
  state: string;
  nonce: string;
  response_type: string;
  code_challenge: string;
  code_challenge_method: string;
  prompt: string;
  post_logout_redirect_uri: string;
  skip: boolean;
  decided_at: Date | null;
  expires_at: Date;
  created_at: Date;
}

const toChallenge = (r: ChallengeRow): OAuthChallenge => ({
  challenge: r.challenge,
  kind: r.kind,
  // client_id / subject нь NULL байж БОЛНО (login challenge-д subject хараахан
  // мэдэгдээгүй; logout challenge-д client_id байхгүй байж болно).
  clientId: r.client_id ?? '',
  subject: r.subject ?? '',
  requestedScopes: r.requested_scopes ?? [],
  grantedScopes: r.granted_scopes ?? [],
  redirectUri: r.redirect_uri,
  state: r.state,
  nonce: r.nonce,
  responseType: r.response_type,
  codeChallenge: r.code_challenge,
  codeChallengeMethod: r.code_challenge_method,
  prompt: r.prompt,
  postLogoutRedirectUri: r.post_logout_redirect_uri,
  skip: r.skip,
  decidedAt: r.decided_at,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

interface CodeRow {
  code_hash: Buffer;
  client_id: string;
  subject: string;
  scopes: string[] | null;
  redirect_uri: string;
  nonce: string;
  code_challenge: string;
  code_challenge_method: string;
  auth_time: Date;
  expires_at: Date;
  used_at: Date | null;
}

interface AccessTokenRow {
  token_hash: Buffer;
  client_id: string;
  subject: string | null;
  scopes: string[] | null;
  expires_at: Date;
}

interface RefreshTokenRow {
  token_hash: Buffer;
  family_id: string;
  client_id: string;
  subject: string;
  scopes: string[] | null;
  nonce: string;
  auth_time: Date;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
}

/** nullable нь хоосон мөрийг SQL NULL болгоно (uuid/text баганад). */
const nullable = (s: string): string | null => (s === '' ? null : s);

class PostgresOAuthFlowRepository implements OAuthFlowRepository {
  constructor(private readonly db: Db) {}

  // ── Challenge ───────────────────────────────────────────────────────

  async createChallenge(ctx: Ctx, c: NewOAuthChallenge): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query(
          `INSERT INTO oauth_challenges (
              challenge, kind, client_id, subject, requested_scopes, granted_scopes,
              redirect_uri, state, nonce, response_type, code_challenge, code_challenge_method,
              prompt, post_logout_redirect_uri, skip, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            c.challenge,
            c.kind,
            nullable(c.clientId),
            nullable(c.subject),
            c.requestedScopes,
            c.grantedScopes,
            c.redirectUri,
            c.state,
            c.nonce,
            c.responseType,
            c.codeChallenge,
            c.codeChallengeMethod,
            c.prompt,
            c.postLogoutRedirectUri,
            c.skip,
            c.expiresAt,
          ],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async challenge(ctx: Ctx, kind: string, challenge: string): Promise<OAuthChallenge> {
    let row: ChallengeRow | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx: Queryable) => {
        // Хугацаа дуусал/шийдэгдсэнийг "олдсонгүй"-тэй ИЖИЛХЭН үзнэ — дахин
        // ашиглах оролдлогод нэмэлт мэдээлэл өгөхгүй.
        const res = await tx.query<ChallengeRow>(
          `SELECT ${challengeColumns} FROM oauth_challenges
            WHERE challenge = $1 AND kind = $2 AND decided_at IS NULL AND expires_at > now()`,
          [challenge, kind],
        );
        return res.rows[0];
      });
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('challenge not found or already used');
    return toChallenge(row);
  }

  async decideChallenge(
    ctx: Ctx,
    challenge: string,
    subject: string,
    granted: string[],
  ): Promise<void> {
    let affected: number;
    try {
      affected = await this.db.withRLS(ctx, async (tx: Queryable) => {
        // `decided_at IS NULL` guard — давхар зарцуулалт боломжгүй.
        const res = await tx.query(
          `UPDATE oauth_challenges
              SET decided_at = now(), subject = COALESCE($2, subject), granted_scopes = $3
            WHERE challenge = $1 AND decided_at IS NULL AND expires_at > now()`,
          [challenge, nullable(subject), granted],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('challenge not found or already used');
  }

  // ── Санагдсан consent ───────────────────────────────────────────────

  async consent(ctx: Ctx, subject: string, clientId: string): Promise<string[]> {
    try {
      return await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query<{ scopes: string[] | null }>(
          `SELECT scopes FROM oauth_consents
            WHERE subject = $1 AND client_id = $2 AND expires_at > now()`,
          [subject, clientId],
        );
        // Байхгүй бол хоосон (алдаа БИШ) — consent UI харагдана.
        return res.rows[0]?.scopes ?? [];
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async saveConsent(
    ctx: Ctx,
    subject: string,
    clientId: string,
    scopes: string[],
    ttlMs: number,
  ): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query(
          `INSERT INTO oauth_consents (subject, client_id, scopes, expires_at)
           VALUES ($1, $2, $3, now() + ($4::text || ' milliseconds')::interval)
           ON CONFLICT (subject, client_id) DO UPDATE
              SET scopes = EXCLUDED.scopes, expires_at = EXCLUDED.expires_at, updated_at = now()`,
          [subject, clientId, scopes, String(ttlMs)],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async revokeConsent(ctx: Ctx, subject: string, clientId: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query('DELETE FROM oauth_consents WHERE subject = $1 AND client_id = $2', [
          subject,
          clientId,
        ]);
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  // ── Authorization code ──────────────────────────────────────────────

  async createCode(ctx: Ctx, c: OAuthAuthCode): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query(
          `INSERT INTO oauth_auth_codes (
              code_hash, client_id, subject, scopes, redirect_uri, nonce,
              code_challenge, code_challenge_method, auth_time, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            c.codeHash,
            c.clientId,
            c.subject,
            c.scopes,
            c.redirectUri,
            c.nonce,
            c.codeChallenge,
            c.codeChallengeMethod,
            c.authTime,
            c.expiresAt,
          ],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async consumeCode(
    ctx: Ctx,
    codeHash: Buffer,
  ): Promise<{ code: OAuthAuthCode; alreadyUsed: boolean }> {
    try {
      return await this.db.withRLS(ctx, async (tx: Queryable) => {
        // Мөрийг ТҮГЖИЖ уншина — өрсөлдөөнт солилцооны хоёр дахь нь ялгаж
        // мэдэгдэнэ (давхар амжилт боломжгүй).
        const res = await tx.query<CodeRow>(
          `SELECT code_hash, client_id, subject, scopes, redirect_uri, nonce,
                  code_challenge, code_challenge_method, auth_time, expires_at, used_at
             FROM oauth_auth_codes
            WHERE code_hash = $1
            FOR UPDATE`,
          [codeHash],
        );
        const row = res.rows[0];
        if (!row) throw notFound('authorization code not found');

        const code: OAuthAuthCode = {
          codeHash: row.code_hash,
          clientId: row.client_id,
          subject: row.subject,
          scopes: row.scopes ?? [],
          redirectUri: row.redirect_uri,
          nonce: row.nonce,
          codeChallenge: row.code_challenge,
          codeChallengeMethod: row.code_challenge_method,
          authTime: row.auth_time,
          expiresAt: row.expires_at,
        };
        // Дуудагч дахин ашиглалтыг илрүүлж бүх token-ыг цуцална.
        if (row.used_at) return { code, alreadyUsed: true };
        if (Date.now() > row.expires_at.getTime()) throw badRequest('authorization code expired');

        await tx.query('UPDATE oauth_auth_codes SET used_at = now() WHERE code_hash = $1', [
          codeHash,
        ]);
        return { code, alreadyUsed: false };
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }

  // ── Access / refresh token ──────────────────────────────────────────

  async storeTokens(ctx: Ctx, at: OAuthAccessToken, rt: OAuthRefreshToken | null): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query(
          `INSERT INTO oauth_access_tokens (token_hash, client_id, subject, scopes, refresh_family, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            at.tokenHash,
            at.clientId,
            nullable(at.subject),
            at.scopes,
            nullable(at.refreshFamily),
            at.expiresAt,
          ],
        );
        if (!rt) return;
        await tx.query(
          `INSERT INTO oauth_refresh_tokens (
              token_hash, family_id, client_id, subject, scopes, nonce, auth_time, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            rt.tokenHash,
            rt.familyId,
            rt.clientId,
            rt.subject,
            rt.scopes,
            rt.nonce,
            rt.authTime,
            rt.expiresAt,
          ],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async accessToken(ctx: Ctx, tokenHash: Buffer): Promise<OAuthAccessToken> {
    let row: AccessTokenRow | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query<AccessTokenRow>(
          `SELECT token_hash, client_id, subject, scopes, expires_at
             FROM oauth_access_tokens
            WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
          [tokenHash],
        );
        return res.rows[0];
      });
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('token not found');
    return {
      tokenHash: row.token_hash,
      clientId: row.client_id,
      subject: row.subject ?? '',
      scopes: row.scopes ?? [],
      refreshFamily: '',
      expiresAt: row.expires_at,
    };
  }

  async consumeRefreshToken(
    ctx: Ctx,
    tokenHash: Buffer,
  ): Promise<{ token: OAuthRefreshToken; reused: boolean }> {
    try {
      return await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query<RefreshTokenRow>(
          `SELECT token_hash, family_id, client_id, subject, scopes, nonce, auth_time,
                  expires_at, consumed_at, revoked_at
             FROM oauth_refresh_tokens
            WHERE token_hash = $1
            FOR UPDATE`,
          [tokenHash],
        );
        const row = res.rows[0];
        if (!row) throw notFound('refresh token not found');

        const token: OAuthRefreshToken = {
          tokenHash: row.token_hash,
          familyId: row.family_id,
          clientId: row.client_id,
          subject: row.subject,
          scopes: row.scopes ?? [],
          nonce: row.nonce,
          authTime: row.auth_time,
          expiresAt: row.expires_at,
        };
        // Аль хэдийн хэрэглэгдсэн/цуцлагдсан token дахин ирэх нь ХУЛГАЙН шинж.
        if (row.consumed_at || row.revoked_at) return { token, reused: true };
        if (Date.now() > row.expires_at.getTime()) throw badRequest('refresh token expired');

        await tx.query(
          'UPDATE oauth_refresh_tokens SET consumed_at = now() WHERE token_hash = $1',
          [tokenHash],
        );
        return { token, reused: false };
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }

  /**
   * revokeFamily нь нэг эргэлтийн гэр бүлийн БҮХ refresh болон access token-ыг
   * цуцална — дахин ашиглалт илэрсэн үед хулгайлагдсан session-ыг бүхэлд нь хаана.
   */
  async revokeFamily(ctx: Ctx, familyId: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query(
          'UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
          [familyId],
        );
        await tx.query(
          'UPDATE oauth_access_tokens SET revoked_at = now() WHERE refresh_family = $1 AND revoked_at IS NULL',
          [familyId],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * revokeForSubjectClient нь тухайн иргэний тухайн апп дахь БҮХ идэвхтэй
   * token-ыг цуцална. Authorization code дахин ашиглагдсан үед хэрэглэнэ:
   * тухайн код ямар token гаргасныг холбосон бичлэг байдаггүй тул хамгийн
   * ойрын аюулгүй хүрээ болох subject+client-ээр цуцална (RFC 6749 §4.1.2).
   */
  async revokeForSubjectClient(ctx: Ctx, subject: string, clientId: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        await tx.query(
          `UPDATE oauth_refresh_tokens SET revoked_at = now()
            WHERE subject = $1 AND client_id = $2 AND revoked_at IS NULL`,
          [subject, clientId],
        );
        await tx.query(
          `UPDATE oauth_access_tokens SET revoked_at = now()
            WHERE subject = $1 AND client_id = $2 AND revoked_at IS NULL`,
          [subject, clientId],
        );
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async revokeAccessToken(ctx: Ctx, tokenHash: Buffer, clientId: string): Promise<boolean> {
    try {
      return await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query(
          `UPDATE oauth_access_tokens SET revoked_at = now()
            WHERE token_hash = $1 AND client_id = $2 AND revoked_at IS NULL`,
          [tokenHash, clientId],
        );
        return (res.rowCount ?? 0) > 0;
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  async revokeRefreshToken(ctx: Ctx, tokenHash: Buffer, clientId: string): Promise<boolean> {
    try {
      return await this.db.withRLS(ctx, async (tx: Queryable) => {
        const res = await tx.query<{ family_id: string }>(
          'SELECT family_id FROM oauth_refresh_tokens WHERE token_hash = $1 AND client_id = $2',
          [tokenHash, clientId],
        );
        const row = res.rows[0];
        if (!row) return false;
        // Нэг refresh token цуцлах нь тухайн session-ий БҮХ эргэлтийг цуцална —
        // RP "гарлаа" гэж хэлж байгаа тул хагас цуцлалт утгагүй.
        await tx.query(
          'UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
          [row.family_id],
        );
        await tx.query(
          'UPDATE oauth_access_tokens SET revoked_at = now() WHERE refresh_family = $1 AND revoked_at IS NULL',
          [row.family_id],
        );
        return true;
      });
    } catch (err) {
      throw internalCause(err);
    }
  }

  /**
   * deleteExpired нь хугацаа дууссан түр мөрүүдийг цэвэрлэнэ. Ашиглагдсан
   * code-ыг ХЭСЭГ ХУГАЦААНД үлдээнэ — дахин ашиглалтыг илрүүлэхэд хэрэгтэй.
   */
  async deleteExpired(ctx: Ctx): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx: Queryable) => {
        for (const sql of [
          `DELETE FROM oauth_challenges WHERE expires_at < now() - interval '1 day'`,
          `DELETE FROM oauth_auth_codes WHERE expires_at < now() - interval '1 day'`,
          `DELETE FROM oauth_access_tokens WHERE expires_at < now() - interval '7 days'`,
          `DELETE FROM oauth_refresh_tokens WHERE expires_at < now() - interval '7 days'`,
          `DELETE FROM oauth_consents WHERE expires_at < now()`,
        ]) {
          await tx.query(sql);
        }
      });
    } catch (err) {
      throw internalCause(err);
    }
  }
}

export const newOAuthFlowRepository = (db: Db): OAuthFlowRepository =>
  new PostgresOAuthFlowRepository(db);
