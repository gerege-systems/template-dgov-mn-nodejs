// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Өөрийн OAuth2/OIDC provider-ийн client (relying party) бүртгэлийн Postgres
// gateway.
//
// oauth_clients нь системийн тохиргооны хүснэгт (хэрэглэгч-тус-бүрийн БИШ) тул
// `applications` / `gateway_services`-ийн адил RLS-гүй — зөвшөөрлийг route
// давхарга (gateway.manage) шийднэ.

import { conflict, internalCause, notFound } from '../../../../apperror/index.js';
import type { OAuthClient } from '../../../../domain/oauth.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import { isUniqueViolation, type Db } from '../../../drivers/pg.js';
import type { OAuthClientRepository } from '../../interface/oauth.js';

const clientColumns = `
  client_id, client_name, secret_hash, token_endpoint_auth_method, app_type,
  grant_types, response_types, scopes, redirect_uris, post_logout_redirect_uris,
  tags, enabled, created_by, created_at, updated_at`;

interface ClientRow {
  client_id: string;
  client_name: string;
  secret_hash: string | null;
  token_endpoint_auth_method: string;
  app_type: string;
  grant_types: string[] | null;
  response_types: string[] | null;
  scopes: string[] | null;
  redirect_uris: string[] | null;
  post_logout_redirect_uris: string[] | null;
  tags: string[] | null;
  enabled: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date | null;
}

const toClient = (r: ClientRow): OAuthClient => ({
  clientId: r.client_id,
  clientName: r.client_name,
  secretHash: r.secret_hash ?? '',
  tokenEndpointAuthMethod: r.token_endpoint_auth_method,
  appType: r.app_type,
  grantTypes: r.grant_types ?? [],
  responseTypes: r.response_types ?? [],
  scopes: r.scopes ?? [],
  redirectUris: r.redirect_uris ?? [],
  postLogoutRedirectUris: r.post_logout_redirect_uris ?? [],
  tags: r.tags ?? [],
  enabled: r.enabled,
  createdBy: r.created_by ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** arr нь undefined/null-ийг Postgres-ийн хоосон text[] болгоно (NOT NULL багана). */
const arr = (v: string[] | undefined | null): string[] => v ?? [];

class OAuthClientPostgres implements OAuthClientRepository {
  constructor(private readonly db: Db) {}

  async list(ctx: Ctx): Promise<OAuthClient[]> {
    try {
      const res = await this.db.query<ClientRow>(
        ctx,
        `SELECT ${clientColumns} FROM oauth_clients ORDER BY created_at DESC`,
      );
      return res.rows.map(toClient);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async get(ctx: Ctx, clientId: string): Promise<OAuthClient> {
    let res;
    try {
      res = await this.db.query<ClientRow>(
        ctx,
        `SELECT ${clientColumns} FROM oauth_clients WHERE client_id = $1`,
        [clientId],
      );
    } catch (err) {
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('application not found');
    return toClient(row);
  }

  async create(ctx: Ctx, c: OAuthClient): Promise<OAuthClient> {
    try {
      const res = await this.db.query<ClientRow>(
        ctx,
        `INSERT INTO oauth_clients (
             client_id, client_name, secret_hash, token_endpoint_auth_method, app_type,
             grant_types, response_types, scopes, redirect_uris, post_logout_redirect_uris,
             tags, enabled, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${clientColumns}`,
        [
          c.clientId,
          c.clientName,
          c.secretHash,
          c.tokenEndpointAuthMethod,
          c.appType,
          arr(c.grantTypes),
          arr(c.responseTypes),
          arr(c.scopes),
          arr(c.redirectUris),
          arr(c.postLogoutRedirectUris),
          arr(c.tags),
          c.enabled,
          c.createdBy === '' ? null : c.createdBy,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error('insert oauth client: no row returned');
      return toClient(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('client_id already exists');
      throw internalCause(err);
    }
  }

  async update(ctx: Ctx, c: OAuthClient): Promise<OAuthClient> {
    let res;
    try {
      // secret_hash-д ЗОРИУДААР хүрэхгүй — Update нь secret-ыг санамсаргүй
      // устгах ёсгүй; түүнийг зөвхөн setSecretHash сольж чадна.
      res = await this.db.query<ClientRow>(
        ctx,
        `UPDATE oauth_clients SET
             client_name = $2, token_endpoint_auth_method = $3, app_type = $4,
             grant_types = $5, response_types = $6, scopes = $7,
             redirect_uris = $8, post_logout_redirect_uris = $9,
             tags = $10, enabled = $11, updated_at = now()
           WHERE client_id = $1
           RETURNING ${clientColumns}`,
        [
          c.clientId,
          c.clientName,
          c.tokenEndpointAuthMethod,
          c.appType,
          arr(c.grantTypes),
          arr(c.responseTypes),
          arr(c.scopes),
          arr(c.redirectUris),
          arr(c.postLogoutRedirectUris),
          arr(c.tags),
          c.enabled,
        ],
      );
    } catch (err) {
      throw internalCause(err);
    }
    const row = res.rows[0];
    if (!row) throw notFound('application not found');
    return toClient(row);
  }

  async setSecretHash(ctx: Ctx, clientId: string, hash: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(
        ctx,
        `UPDATE oauth_clients SET secret_hash = $2, updated_at = now() WHERE client_id = $1`,
        [clientId, hash],
      );
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('application not found');
  }

  /** deleteClient нь client-ыг устгана. Түүний code/token/consent-ууд FK cascade-ээр устана. */
  async deleteClient(ctx: Ctx, clientId: string): Promise<void> {
    let affected: number;
    try {
      const res = await this.db.query(ctx, `DELETE FROM oauth_clients WHERE client_id = $1`, [
        clientId,
      ]);
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('application not found');
  }
}

export const newOAuthClientRepository = (db: Db): OAuthClientRepository =>
  new OAuthClientPostgres(db);
