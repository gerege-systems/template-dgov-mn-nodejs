// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/oidc нь ӨӨРИЙН OAuth2/OIDC provider-ийн протоколын логик:
// authorize → login/consent challenge → authorization code → token (+id_token),
// refresh эргэлт, introspect/userinfo/revoke болон RP-initiated logout.
//
// Аюулгүй байдлын гол цэгүүд (Go хувилбараас 1:1):
//   • redirect_uri нь ЯГ тулгагдана — prefix/wildcard ХЭЗЭЭ Ч биш;
//   • алдааг RP руу зөвхөн redirect_uri БАТАЛГААЖСАНЫ дараа буцаана;
//   • PKCE: public client-д заавал, зөвхөн S256;
//   • authorization code нэг удаагийн — дахин ирвэл тухайн иргэн+апп-ийн бүх
//     token цуцлагдана;
//   • refresh token эргэлттэй — дахин ашиглалт илэрвэл БҮХ гэр бүл цуцлагдана.

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import {
  badRequest,
  ErrorType,
  forbidden,
  internalCause,
  is,
  isNotFound,
  unauthorized,
} from '../../apperror/index.js';
import type {
  OAuthClientRepository,
  OAuthFlowRepository,
} from '../../datasources/repositories/interface/oauth.js';
import {
  ChallengeConsent,
  ChallengeLogin,
  ChallengeLogout,
  filterAllowedScopes,
  GrantAuthorizationCode,
  GrantClientCredentials,
  GrantRefreshToken,
  hasGrant,
  isPublicClient,
  matchPostLogoutRedirectUri,
  matchRedirectUri,
  AuthMethodBasic,
  AuthMethodNone,
  AuthMethodPost,
} from '../../domain/oauth.js';
import type { OAuthChallenge, OAuthClient } from '../../domain/oauth.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { withService, withUser } from '../../pkg/ctx/ctx.js';
import { verify as verifySecret } from '../../pkg/secrethash/secrethash.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { claimsForScopes } from './claims.js';
import { ScopeOfflineAccess, ScopeOpenID } from './discovery.js';
import type { KeyManager } from './keys.js';

// ── Хугацаанууд ──────────────────────────────────────────────────────────
// Authorization code нь боломжийн хэрээр богино байх ёстой — browser-ийн
// хаягийн мөр, referrer, лог зэрэгт үлдэх боломжтой (RFC 9700 §2.1.1).
export const ChallengeTTLMs = 15 * 60 * 1000;
export const AuthCodeTTLMs = 60 * 1000;
export const ConsentTTLMs = 30 * 24 * 60 * 60 * 1000;
export const AccessTokenTTLMs = 60 * 60 * 1000;
export const RefreshTokenTTLMs = 30 * 24 * 60 * 60 * 1000;
export const IDTokenTTLMs = 60 * 60 * 1000;

/**
 * AuthorizeError нь RP руу буцаах ёстой протоколын алдаа (RFC 6749 §4.1.2.1).
 *
 * redirectUri нь ЗӨВХӨН client-ийн бүртгэлтэй ЯГ тулгагдсаны ДАРАА дүүрнэ.
 * Хоосон бол дуудагч ХЭЗЭЭ Ч redirect хийхгүй, алдааг шууд харуулна. Ингэснээр
 * "баталгаажаагүй хаяг руу чиглүүлэх" алдаа нь БҮТЦИЙН ХУВЬД боломжгүй болно:
 * handler нь өөрт ирсэн түүхий redirect_uri-г огт хардаггүй.
 */
export class AuthorizeError extends Error {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly redirectUri = '',
    readonly state = '',
  ) {
    super(`${code}: ${description}`);
    this.name = 'AuthorizeError';
  }

  /** canRedirect нь алдааг RP руу буцаах боломжтой эсэхийг заана. */
  canRedirect(): boolean {
    return this.redirectUri !== '';
  }

  /** redirectUrl нь RP руу буцаах алдааны бүтэн URL. */
  redirectUrl(): string {
    return redirectWith(this.redirectUri, {
      error: this.code,
      error_description: this.description,
      state: this.state,
    });
  }
}

/** TokenError нь RFC 6749 §5.2-ийн token endpoint-ийн алдаа. */
export class TokenError extends Error {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly status: number,
  ) {
    super(`${code}: ${description}`);
    this.name = 'TokenError';
  }
}

const badGrant = (desc: string): TokenError => new TokenError('invalid_grant', desc, 400);

/** AuthorizeRequest нь `/oauth2/auth`-ийн задлагдсан параметрүүд. */
export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  prompt: string;
}

/** TokenRequest нь `/oauth2/token`-ийн задлагдсан параметрүүд. */
export interface TokenRequest {
  grantType: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  refreshToken: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  /** secretFromBasic нь итгэмжлэл Authorization: Basic-ээс ирсэн эсэхийг заана. */
  secretFromBasic: boolean;
}

/** TokenResponse нь амжилттай token хариу (RFC 6749 §5.1). */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

/** TokenInfo нь access token-ийн шалгасан төлөв (RFC 7662). */
export interface TokenInfo {
  active: boolean;
  scope?: string;
  client_id?: string;
  sub?: string;
  exp?: number;
  token_type?: string;
  /** scopes нь дотоод хэрэглээ — JSON хариунд ГАРАХГҮЙ. */
  scopes?: string[];
}

// ── Туслахууд ────────────────────────────────────────────────────────────

/**
 * redirectWith нь параметрүүдийг redirect_uri-ийн ОДОО БАЙГАА query дээр нэмнэ
 * (RP-ийн өөрийн query-г устгахгүй).
 */
export function redirectWith(redirectUri: string, params: Record<string, string>): string {
  let u: URL;
  try {
    u = new URL(redirectUri);
  } catch {
    return redirectUri;
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

const splitScope = (s: string): string[] => s.split(/\s+/).filter((x) => x !== '');
const joinScope = (scopes: string[]): string => scopes.join(' ');

/** intersect нь a-д БАЙГАА b-ийн элементүүдийг a-гийн дарааллаар буцаана. */
function intersect(a: string[], b: string[]): string[] {
  const want = new Set(b);
  return a.filter((s) => want.has(s));
}

/** coversAll нь have нь want-ийн БҮХ элементийг агуулж байгаа эсэхийг шалгана. */
function coversAll(have: string[], want: string[]): boolean {
  if (want.length === 0) return false;
  const set = new Set(have);
  return want.every((s) => set.has(s));
}

/** randomToken нь 32 байт криптографийн санамсаргүй утгыг base64url болгоно. */
const randomToken = (): string => randomBytes(32).toString('base64url');

/**
 * hashToken нь нууц утгыг хадгалахын ӨМНӨ sha256-аар хэшилнэ. Утга нь өндөр
 * энтропитой санамсаргүй тул давсны хэрэг байхгүй (энэ нь нууц үг БИШ).
 */
const hashToken = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest();

/** s256Challenge нь code_verifier-ээс PKCE-ийн S256 challenge-ыг гаргана. */
export const s256Challenge = (verifier: string): string =>
  createHash('sha256').update(verifier, 'utf8').digest('base64url');

/** verifyPKCE нь code_verifier нь хадгалсан challenge-тай тохирч байгааг шалгана. */
export function verifyPKCE(codeChallenge: string, method: string, verifier: string): boolean {
  // PKCE ашиглаагүй урсгал — verifier ч байх ёсгүй.
  if (codeChallenge === '') return verifier === '';
  if (method !== 'S256' || verifier === '') return false;
  return s256Challenge(verifier) === codeChallenge;
}

/**
 * OIDCService нь authorize/consent/token урсгалын протоколын логик.
 *
 * keys / users нь ЗӨВХӨН id_token гаргахад хэрэгтэй — authorize урсгал
 * тэдгээргүйгээр ажиллана (тест хийхэд хялбар).
 */
export class OIDCService {
  private keys: KeyManager | null = null;
  private users: UsersUsecase | null = null;
  private readonly issuerValue: string;

  constructor(
    private readonly clients: OAuthClientRepository,
    private readonly flow: OAuthFlowRepository,
    issuer: string,
  ) {
    this.issuerValue = issuer.replace(/\/+$/, '');
  }

  /**
   * withTokenIssuing нь token гаргах чадварыг (id_token гарын үсэг + иргэний
   * бүртгэл) залгана.
   */
  withTokenIssuing(keys: KeyManager, users: UsersUsecase): this {
    this.keys = keys;
    this.users = users;
    return this;
  }

  get issuer(): string {
    return this.issuerValue;
  }

  /**
   * flowCtx нь протоколын төлөвийн (challenge / code / token / consent) query-д
   * RLS-ийн "service" үүргийг тавина.
   *
   * ЯАГААД ЭНД, route дээр БИШ: эдгээр хүснэгтэд хандах нь дуудагчаас үл
   * хамаарна. `/oauth2/*` нь нэвтрээгүй дуудагдана, харин `/api/v1/provider/*`
   * нь authMiddleware-ийн ард ажилладаг бөгөөд тэр нь identity-г "user" болгож
   * дардаг тул route-д суулгасан service identity чимээгүй хүчингүй болно.
   *
   * Энэ нь эрхийг ӨРГӨТГӨХГҮЙ: протоколын шалгалтууд (challenge-ийн subject,
   * client-ийн эзэмшил, PKCE) нь энэ давхаргад хийгддэг.
   */
  private static flowCtx(ctx: Ctx): Ctx {
    return withService(ctx);
  }

  // ── Authorize ───────────────────────────────────────────────────────

  /**
   * authorize нь `/oauth2/auth`-ийн хүсэлтийг шалгаж, login challenge үүсгээд
   * нэвтрэх хуудас руу чиглүүлэх challenge-ыг буцаана.
   *
   * Шалгалтын ДАРААЛАЛ санаатай: client болон redirect_uri-г ЭХЭЛЖ шалгана,
   * учир нь тэдгээр нь зөв болтол алдааг RP руу буцаах аргагүй (буцаах хаяг нь
   * өөрөө баталгаажаагүй).
   */
  async authorize(
    ctx: Ctx,
    req: AuthorizeRequest,
  ): Promise<{ challenge: string; client: OAuthClient }> {
    if (req.clientId.trim() === '') {
      throw new AuthorizeError('invalid_request', 'client_id is required');
    }

    let client: OAuthClient;
    try {
      client = await this.clients.get(ctx, req.clientId);
    } catch (err) {
      if (isNotFound(err)) throw new AuthorizeError('invalid_client', 'unknown client');
      throw err;
    }
    if (!client.enabled) {
      throw new AuthorizeError('unauthorized_client', 'client is disabled');
    }

    // redirect_uri нь ЯГ бүртгэгдсэн байх ёстой. Хоосон бол ч татгалзана —
    // "цорын ганц бүртгэгдсэнийг нь ав" гэсэн тайвшрал нь алдаанд хүргэдэг.
    if (!matchRedirectUri(client, req.redirectUri)) {
      throw new AuthorizeError('invalid_request', 'redirect_uri is not registered for this client');
    }

    // ЭНДЭЭС ХОЙШ алдааг RP руу буцаана.
    const rp = req.redirectUri;
    if (req.responseType !== 'code') {
      throw new AuthorizeError(
        'unsupported_response_type',
        'only response_type=code is supported',
        rp,
        req.state,
      );
    }
    if (!hasGrant(client, GrantAuthorizationCode)) {
      throw new AuthorizeError(
        'unauthorized_client',
        'client may not use the authorization code grant',
        rp,
        req.state,
      );
    }

    // PKCE. Public client-д ЗААВАЛ; confidential client-д өгсөн бол шалгана.
    // `plain` арга нь хамгаалалт өгдөггүй тул огт зөвшөөрөхгүй (RFC 9700 §2.1.1).
    if (req.codeChallenge !== '') {
      if (req.codeChallengeMethod !== 'S256') {
        throw new AuthorizeError(
          'invalid_request',
          'code_challenge_method must be S256',
          rp,
          req.state,
        );
      }
    } else if (isPublicClient(client)) {
      throw new AuthorizeError(
        'invalid_request',
        'code_challenge is required for public clients',
        rp,
        req.state,
      );
    }

    const granted = filterAllowedScopes(client, splitScope(req.scope));
    if (granted.length === 0) {
      throw new AuthorizeError(
        'invalid_scope',
        'none of the requested scopes are allowed for this client',
        rp,
        req.state,
      );
    }

    const challenge = randomToken();
    await this.flow.createChallenge(OIDCService.flowCtx(ctx), {
      challenge,
      kind: ChallengeLogin,
      clientId: client.clientId,
      subject: '',
      requestedScopes: granted,
      grantedScopes: [],
      redirectUri: req.redirectUri,
      state: req.state,
      nonce: req.nonce,
      responseType: req.responseType,
      codeChallenge: req.codeChallenge,
      codeChallengeMethod: req.codeChallengeMethod,
      prompt: req.prompt,
      postLogoutRedirectUri: '',
      skip: false,
      expiresAt: new Date(Date.now() + ChallengeTTLMs),
    });
    return { challenge, client };
  }

  /** loginChallenge нь ХҮЧИНТЭЙ login challenge-ыг буцаана. */
  loginChallenge(ctx: Ctx, challenge: string): Promise<OAuthChallenge> {
    return this.flow.challenge(OIDCService.flowCtx(ctx), ChallengeLogin, challenge);
  }

  /** consentChallenge нь ХҮЧИНТЭЙ consent challenge-ыг буцаана. */
  consentChallenge(ctx: Ctx, challenge: string): Promise<OAuthChallenge> {
    return this.flow.challenge(OIDCService.flowCtx(ctx), ChallengeConsent, challenge);
  }

  /** logoutChallenge нь ХҮЧИНТЭЙ logout challenge-ыг буцаана. */
  logoutChallenge(ctx: Ctx, challenge: string): Promise<OAuthChallenge> {
    return this.flow.challenge(OIDCService.flowCtx(ctx), ChallengeLogout, challenge);
  }

  /**
   * acceptLogin нь иргэнийг тухайн login challenge-д баталгаажуулж, consent
   * challenge үүсгэнэ. Аль хэдийн санагдсан зөвшөөрөл байвал skip=true болно.
   */
  async acceptLogin(
    ctx: Ctx,
    challenge: string,
    subject: string,
  ): Promise<{ consentChallenge: string; skip: boolean }> {
    const fctx = OIDCService.flowCtx(ctx);
    const login = await this.flow.challenge(fctx, ChallengeLogin, challenge);
    await this.flow.decideChallenge(fctx, challenge, subject, login.requestedScopes);

    // Өмнө нь олгосон зөвшөөрөл хүссэн scope-ыг БҮРЭН хамарч байвал л алгасна.
    const remembered = await this.flow.consent(fctx, subject, login.clientId);
    const skip = coversAll(remembered, login.requestedScopes);

    const consentChallenge = randomToken();
    await this.flow.createChallenge(fctx, {
      challenge: consentChallenge,
      kind: ChallengeConsent,
      clientId: login.clientId,
      subject,
      requestedScopes: login.requestedScopes,
      grantedScopes: [],
      redirectUri: login.redirectUri,
      state: login.state,
      nonce: login.nonce,
      responseType: login.responseType,
      codeChallenge: login.codeChallenge,
      codeChallengeMethod: login.codeChallengeMethod,
      prompt: login.prompt,
      postLogoutRedirectUri: '',
      skip,
      expiresAt: new Date(Date.now() + ChallengeTTLMs),
    });
    return { consentChallenge, skip };
  }

  /**
   * acceptConsent нь олгосон scope-оор authorization code гаргаж, RP руу буцах
   * бүтэн URL-ыг буцаана.
   *
   * subject нь challenge дээрх subject-тэй ТААРАХ ёстой — өөр иргэний нээлттэй
   * challenge-ыг өөрийн session-ээр дуусгах боломжийг хаана.
   */
  async acceptConsent(
    ctx: Ctx,
    challenge: string,
    subject: string,
    grantScope: string[],
  ): Promise<string> {
    const fctx = OIDCService.flowCtx(ctx);
    const c = await this.flow.challenge(fctx, ChallengeConsent, challenge);
    if (c.subject !== subject) {
      throw forbidden('consent challenge belongs to a different user');
    }

    // Олгож болох scope нь хүссэнээс ХЭТРЭХГҮЙ (эрх өсгөх боломжгүй).
    // UI юу ч заагаагүй → бүгдийг.
    const granted =
      grantScope.length === 0 ? c.requestedScopes : intersect(c.requestedScopes, grantScope);
    if (granted.length === 0) throw badRequest('no scope was granted');

    await this.flow.decideChallenge(fctx, challenge, subject, granted);
    await this.flow.saveConsent(fctx, subject, c.clientId, granted, ConsentTTLMs);

    const code = randomToken();
    const now = new Date();
    await this.flow.createCode(fctx, {
      codeHash: hashToken(code),
      clientId: c.clientId,
      subject,
      scopes: granted,
      redirectUri: c.redirectUri,
      nonce: c.nonce,
      codeChallenge: c.codeChallenge,
      codeChallengeMethod: c.codeChallengeMethod,
      authTime: now,
      expiresAt: new Date(now.getTime() + AuthCodeTTLMs),
    });

    return redirectWith(c.redirectUri, { code, state: c.state });
  }

  /** reject нь урсгалыг зогсоож, алдааг RP руу буцаах URL-ыг үүсгэнэ. */
  async reject(ctx: Ctx, kind: string, challenge: string, reason: string): Promise<string> {
    const fctx = OIDCService.flowCtx(ctx);
    const c = await this.flow.challenge(fctx, kind, challenge);
    await this.flow.decideChallenge(fctx, challenge, c.subject, []);
    return redirectWith(c.redirectUri, {
      error: 'access_denied',
      error_description: reason === '' ? 'the request was denied' : reason,
      state: c.state,
    });
  }

  // ── Token ───────────────────────────────────────────────────────────

  /** token нь `/oauth2/token`-ийг үйлчилнэ. */
  async token(ctx: Ctx, req: TokenRequest): Promise<TokenResponse> {
    const client = await this.authenticateClient(ctx, req);
    switch (req.grantType) {
      case GrantAuthorizationCode:
        return this.exchangeCode(ctx, client, req);
      case GrantRefreshToken:
        return this.refresh(ctx, client, req);
      case GrantClientCredentials:
        return this.clientCredentials(ctx, client, req);
      default:
        throw new TokenError('unsupported_grant_type', 'unsupported grant_type', 400);
    }
  }

  /**
   * authenticateClient нь client-ийг бүртгэгдсэн auth method-оор нь
   * баталгаажуулна.
   *
   * Client-ийн зарласан арга нь ХАТУУ — `client_secret_basic`-тэй client биеттэй
   * secret илгээвэл татгалзана. Ингэснээр аргыг доошлуулах (downgrade) оролдлого
   * боломжгүй.
   */
  async authenticateClient(ctx: Ctx, req: TokenRequest): Promise<OAuthClient> {
    if (req.clientId === '') {
      throw new TokenError('invalid_client', 'client_id is required', 401);
    }

    let client: OAuthClient;
    try {
      client = await this.clients.get(ctx, req.clientId);
    } catch (err) {
      if (isNotFound(err)) throw new TokenError('invalid_client', 'unknown client', 401);
      throw err;
    }
    if (!client.enabled) throw new TokenError('invalid_client', 'client is disabled', 401);

    switch (client.tokenEndpointAuthMethod) {
      case AuthMethodNone:
        // Public client — secret байх ЁСГҮЙ. Хамгаалалт нь PKCE.
        if (req.clientSecret !== '') {
          throw new TokenError('invalid_client', 'public client must not send a secret', 401);
        }
        return client;
      case AuthMethodBasic:
        if (!req.secretFromBasic) {
          throw new TokenError('invalid_client', 'client must authenticate with HTTP Basic', 401);
        }
        break;
      case AuthMethodPost:
        if (req.secretFromBasic) {
          throw new TokenError(
            'invalid_client',
            'client must authenticate with client_secret_post',
            401,
          );
        }
        break;
      default:
        throw new TokenError('invalid_client', 'unsupported client authentication method', 401);
    }

    if (req.clientSecret === '' || client.secretHash === '') {
      throw new TokenError('invalid_client', 'invalid client credentials', 401);
    }
    let ok = false;
    try {
      ok = await verifySecret(client.secretHash, req.clientSecret);
    } catch {
      ok = false;
    }
    if (!ok) {
      // Формат танигдахгүй байсан ч "буруу итгэмжлэл" гэж хариулна — дотоод
      // байдлыг ил гаргахгүй (fail-closed).
      throw new TokenError('invalid_client', 'invalid client credentials', 401);
    }
    return client;
  }

  /** exchangeCode нь authorization code-ыг token болгож солино. */
  private async exchangeCode(
    ctx: Ctx,
    client: OAuthClient,
    req: TokenRequest,
  ): Promise<TokenResponse> {
    if (!hasGrant(client, GrantAuthorizationCode)) {
      throw new TokenError('unauthorized_client', 'client may not use this grant', 400);
    }
    if (req.code === '') {
      throw new TokenError('invalid_request', 'code is required', 400);
    }

    const fctx = OIDCService.flowCtx(ctx);
    let consumed: {
      code: Awaited<ReturnType<OAuthFlowRepository['consumeCode']>>['code'];
      alreadyUsed: boolean;
    };
    try {
      consumed = await this.flow.consumeCode(fctx, hashToken(req.code));
    } catch (err) {
      if (isNotFound(err)) throw badGrant('authorization code is invalid');
      if (is(err, ErrorType.BadRequest)) throw badGrant('authorization code has expired');
      throw err;
    }
    const { code, alreadyUsed } = consumed;

    // Дахин ашиглалт: код нэгэнт солигдсон байна. Түүгээр гаргасан бүх token-ыг
    // цуцална — код алдагдсан бол халдагчийн авсан session ажиллахгүй болно
    // (RFC 6749 §4.1.2, RFC 9700 §2.1.1).
    if (alreadyUsed) {
      if (code.subject !== '') {
        await this.flow
          .revokeForSubjectClient(fctx, code.subject, code.clientId)
          .catch(() => undefined);
      }
      throw badGrant('authorization code has already been used');
    }

    // Код нь ЯГ энэ client-д олгогдсон байх ёстой.
    if (code.clientId !== client.clientId) {
      throw badGrant('authorization code was issued to another client');
    }
    // redirect_uri нь authorize үеийнхтэй ижил байх ёстой (RFC 6749 §4.1.3).
    if (req.redirectUri !== code.redirectUri) {
      throw badGrant('redirect_uri does not match the authorization request');
    }
    if (!verifyPKCE(code.codeChallenge, code.codeChallengeMethod, req.codeVerifier)) {
      throw badGrant('code_verifier does not match the code_challenge');
    }

    return this.issue(ctx, client, code.subject, code.scopes, code.nonce, code.authTime, '');
  }

  /** refresh нь refresh token-ыг эргүүлж шинэ хосыг гаргана. */
  private async refresh(ctx: Ctx, client: OAuthClient, req: TokenRequest): Promise<TokenResponse> {
    if (!hasGrant(client, GrantRefreshToken)) {
      throw new TokenError('unauthorized_client', 'client may not use this grant', 400);
    }
    if (req.refreshToken === '') {
      throw new TokenError('invalid_request', 'refresh_token is required', 400);
    }

    const fctx = OIDCService.flowCtx(ctx);
    let result: Awaited<ReturnType<OAuthFlowRepository['consumeRefreshToken']>>;
    try {
      result = await this.flow.consumeRefreshToken(fctx, hashToken(req.refreshToken));
    } catch (err) {
      if (isNotFound(err)) throw badGrant('refresh token is invalid');
      if (is(err, ErrorType.BadRequest)) throw badGrant('refresh token has expired');
      throw err;
    }
    const { token: rt, reused } = result;

    // Хэрэглэгдсэн refresh token дахин ирлээ = ХУЛГАЙН шинж. Гэр бүлийг бүхэлд
    // нь цуцална: хууль ёсны эзэн ч, халдагч ч дахин нэвтрэх шаардлагатай болно
    // (RFC 9700 §4.14.2).
    if (reused) {
      await this.flow.revokeFamily(fctx, rt.familyId).catch(() => undefined);
      throw badGrant('refresh token has already been used');
    }
    if (rt.clientId !== client.clientId) {
      await this.flow.revokeFamily(fctx, rt.familyId).catch(() => undefined);
      throw badGrant('refresh token was issued to another client');
    }

    // Scope-ыг НАРИЙСГАЖ болно, өргөтгөж БОЛОХГҮЙ (RFC 6749 §6).
    let scopes = rt.scopes;
    if (req.scope !== '') {
      const narrowed = intersect(rt.scopes, splitScope(req.scope));
      if (narrowed.length === 0) {
        throw new TokenError('invalid_scope', 'requested scope exceeds the original grant', 400);
      }
      scopes = narrowed;
    }

    return this.issue(ctx, client, rt.subject, scopes, rt.nonce, rt.authTime, rt.familyId);
  }

  /** clientCredentials нь хэрэглэгчгүй (m2m) token гаргана. */
  private async clientCredentials(
    ctx: Ctx,
    client: OAuthClient,
    req: TokenRequest,
  ): Promise<TokenResponse> {
    if (!hasGrant(client, GrantClientCredentials)) {
      throw new TokenError('unauthorized_client', 'client may not use this grant', 400);
    }
    if (isPublicClient(client)) {
      throw new TokenError('invalid_client', 'public clients may not use client_credentials', 401);
    }

    let scopes = client.scopes;
    if (req.scope !== '') {
      scopes = filterAllowedScopes(client, splitScope(req.scope));
      if (scopes.length === 0) {
        throw new TokenError('invalid_scope', 'none of the requested scopes are allowed', 400);
      }
    }

    const access = randomToken();
    await this.flow.storeTokens(
      OIDCService.flowCtx(ctx),
      {
        tokenHash: hashToken(access),
        clientId: client.clientId,
        subject: '',
        scopes,
        refreshFamily: '',
        expiresAt: new Date(Date.now() + AccessTokenTTLMs),
      },
      null,
    );
    // client_credentials-д хэрэглэгч байхгүй тул id_token ч, refresh ч байхгүй.
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: AccessTokenTTLMs / 1000,
      scope: joinScope(scopes),
    };
  }

  /**
   * issue нь access (+refresh, +id_token) хосыг гаргаж хадгална.
   *
   * family нь хоосон бол шинэ эргэлтийн гэр бүл эхэлнэ; эс бөгөөс өмнөхийг
   * үргэлжлүүлнэ (эргэлт).
   */
  private async issue(
    ctx: Ctx,
    client: OAuthClient,
    subject: string,
    scopes: string[],
    nonce: string,
    authTime: Date,
    family: string,
  ): Promise<TokenResponse> {
    const access = randomToken();
    const now = Date.now();

    // offline_access-гүй бол refresh token гаргахгүй (OIDC Core §11).
    const wantRefresh = hasGrant(client, GrantRefreshToken) && scopes.includes(ScopeOfflineAccess);
    const familyId = family === '' && wantRefresh ? randomUUID() : family;

    let refresh = '';
    const at = {
      tokenHash: hashToken(access),
      clientId: client.clientId,
      subject,
      scopes,
      refreshFamily: familyId,
      expiresAt: new Date(now + AccessTokenTTLMs),
    };
    let rt = null;
    if (wantRefresh) {
      refresh = randomToken();
      rt = {
        tokenHash: hashToken(refresh),
        familyId,
        clientId: client.clientId,
        subject,
        scopes,
        nonce,
        authTime,
        expiresAt: new Date(now + RefreshTokenTTLMs),
      };
    }

    await this.flow.storeTokens(OIDCService.flowCtx(ctx), at, rt);

    const resp: TokenResponse = {
      access_token: access,
      token_type: 'bearer',
      expires_in: AccessTokenTTLMs / 1000,
      scope: joinScope(scopes),
    };
    if (refresh !== '') resp.refresh_token = refresh;

    // id_token нь ЗӨВХӨН openid scope-той үед (OIDC Core §3.1.3.3).
    if (scopes.includes(ScopeOpenID)) {
      resp.id_token = await this.mintIDToken(ctx, client, subject, scopes, nonce, authTime);
    }
    return resp;
  }

  /** mintIDToken нь иргэний claims-ыг угсарч RS256-аар гарын үсэг зурна. */
  private async mintIDToken(
    ctx: Ctx,
    client: OAuthClient,
    subject: string,
    scopes: string[],
    nonce: string,
    authTime: Date,
  ): Promise<string> {
    const keys = this.keys;
    const users = this.users;
    if (!keys || !users) {
      throw internalCause(new Error('oidc: id_token requires a key manager and user lookup'));
    }

    // Хэрэглэгчийг ЗААВАЛ уншина — уншиж чадахгүй бол token гаргахгүй
    // (fail-closed). Token endpoint нь нэвтрээгүй дуудагддаг тул context-д RLS
    // identity байхгүй; `users` хүснэгт RLS-тэй учир token-ыг ЯГ энэ subject-д
    // гаргаж байгаа тул түүний ӨӨРИЙН мөрийг user үүргээр уншина (service үүрэг
    // өгвөл бүх хэрэглэгч нээгдэх тул хэрэггүй өргөн эрх болно).
    let user;
    try {
      const res = await users.getById(withUser(ctx, subject), { id: subject });
      user = res.user;
    } catch (err) {
      throw internalCause(new Error(`oidc: load user for id_token: ${String(err)}`));
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: this.issuerValue,
      sub: subject,
      aud: client.clientId,
      iat: nowSec,
      exp: nowSec + IDTokenTTLMs / 1000,
      ...claimsForScopes(scopes, user),
    };
    if (authTime.getTime() > 0) claims.auth_time = Math.floor(authTime.getTime() / 1000);
    if (nonce !== '') claims.nonce = nonce;

    const { kid, key } = await keys.signer(ctx);
    try {
      return jwt.sign(claims, key, { algorithm: 'RS256', keyid: kid, noTimestamp: true });
    } catch (err) {
      throw internalCause(new Error(`oidc: sign id_token: ${String(err)}`));
    }
  }

  // ── Introspect / userinfo / revoke ──────────────────────────────────

  /**
   * introspect нь access token-ыг шалгана (RFC 7662).
   *
   * caller нь дуудаж буй client-ийн ID. ӨӨР client-ийн token-ыг шалгах
   * боломжгүй (RFC 7662 §2.1). caller хоосон бол ДОТООД дуудлага гэж үзнэ.
   *
   * Танигдаагүй/дууссан/цуцлагдсан/өөр client-ийн token бүхэнд ялгаагүй
   * `{"active": false}` буцаана — шалтгааныг нь ялгаж хэлэхгүй.
   */
  async introspect(ctx: Ctx, caller: string, token: string): Promise<TokenInfo> {
    if (token === '') return { active: false };
    let at;
    try {
      at = await this.flow.accessToken(OIDCService.flowCtx(ctx), hashToken(token));
    } catch {
      return { active: false };
    }
    if (caller !== '' && at.clientId !== caller) return { active: false };
    return {
      active: true,
      scope: joinScope(at.scopes),
      scopes: at.scopes,
      client_id: at.clientId,
      sub: at.subject,
      exp: Math.floor(at.expiresAt.getTime() / 1000),
      token_type: 'Bearer',
    };
  }

  /** userinfo нь access token-ий эзэн иргэний claims-ыг буцаана (OIDC §5.3). */
  async userinfo(ctx: Ctx, token: string): Promise<Record<string, unknown>> {
    // Дотоод дуудлага: userinfo-г token өөрөө эрхшээдэг тул caller хоосон.
    const info = await this.introspect(ctx, '', token);
    if (!info.active) throw unauthorized('invalid or expired access token');
    // client_credentials token-д хэрэглэгч байхгүй тул userinfo утгагүй.
    if (!info.sub) throw forbidden('token has no subject');
    if (!(info.scopes ?? []).includes(ScopeOpenID)) {
      throw forbidden('token does not carry the openid scope');
    }
    const users = this.users;
    if (!users) throw internalCause(new Error('oidc: userinfo requires a user lookup'));

    // mintIDToken-той ижил шалтгаан: token-ий эзний ӨӨРИЙН мөрийг user үүргээр.
    let user;
    try {
      const res = await users.getById(withUser(ctx, info.sub), { id: info.sub });
      user = res.user;
    } catch (err) {
      throw internalCause(err);
    }
    return { ...claimsForScopes(info.scopes ?? [], user), sub: info.sub };
  }

  /**
   * revoke нь token-ыг цуцална (RFC 7009).
   *
   * RFC-ийн дагуу танигдаагүй token ч АМЖИЛТТАЙ гэж хариулна — client нь token
   * хүчинтэй байсан эсэхийг мэдэх ёсгүй. Гэхдээ ӨӨР client-ийн token-ыг цуцлах
   * боломжгүй (эзэмшлийг шалгана).
   */
  async revoke(ctx: Ctx, client: OAuthClient, token: string, hint: string): Promise<void> {
    if (token === '') return;
    const fctx = OIDCService.flowCtx(ctx);
    const h = hashToken(token);
    // Hint-ийг эхэлж оролдоод, олдохгүй бол нөгөөг нь — hint нь зөвлөмж төдий.
    const order =
      hint === 'refresh_token'
        ? (['refresh_token', 'access_token'] as const)
        : (['access_token', 'refresh_token'] as const);
    for (const kind of order) {
      const found =
        kind === 'access_token'
          ? await this.flow.revokeAccessToken(fctx, h, client.clientId)
          : await this.flow.revokeRefreshToken(fctx, h, client.clientId);
      if (found) return;
    }
    // Танигдсангүй — RFC-ийн дагуу амжилттай.
  }

  // ── RP-initiated logout ─────────────────────────────────────────────

  /**
   * startLogout нь `/oauth2/sessions/logout`-ийн хүсэлтээс logout challenge
   * үүсгэнэ. post_logout_redirect_uri өгсөн бол тухайн client-д БҮРТГЭГДСЭН
   * байх ёстой — эс бөгөөс logout-ийг дурын хаяг руу чиглүүлэх open redirect.
   */
  async startLogout(
    ctx: Ctx,
    clientId: string,
    idTokenHint: string,
    postLogoutRedirectUri: string,
    state: string,
  ): Promise<string> {
    // RP-үүд ихэвчлэн `client_id` биш `id_token_hint` илгээдэг. Hint-ээс
    // client-ыг гаргаж авна; гарын үсэг нь баталгаажсан тул өөр апп-ийн нэрийн
    // өмнөөс logout эхлүүлэх боломжгүй.
    let cid = clientId;
    let subject = '';
    if (cid === '' && idTokenHint !== '') {
      const parsed = await this.parseIDTokenHint(ctx, idTokenHint);
      cid = parsed.clientId;
      subject = parsed.subject;
    }

    let redirect = '';
    if (postLogoutRedirectUri !== '') {
      if (cid === '') {
        throw badRequest('client_id or id_token_hint is required with post_logout_redirect_uri');
      }
      const client = await this.clients.get(ctx, cid);
      if (!matchPostLogoutRedirectUri(client, postLogoutRedirectUri)) {
        throw badRequest('post_logout_redirect_uri is not registered for this client');
      }
      redirect = postLogoutRedirectUri;
    }

    const challenge = randomToken();
    await this.flow.createChallenge(OIDCService.flowCtx(ctx), {
      challenge,
      kind: ChallengeLogout,
      clientId: cid,
      subject,
      requestedScopes: [],
      grantedScopes: [],
      redirectUri: '',
      state,
      nonce: '',
      responseType: '',
      codeChallenge: '',
      codeChallengeMethod: '',
      prompt: '',
      postLogoutRedirectUri: redirect,
      skip: false,
      expiresAt: new Date(Date.now() + ChallengeTTLMs),
    });
    return challenge;
  }

  /**
   * acceptLogout нь logout challenge-ыг дуусгаж, буцах хаягийг өгнө.
   * Бүртгэгдсэн post_logout_redirect_uri байхгүй бол issuer-ийн нүүр рүү.
   */
  async acceptLogout(ctx: Ctx, challenge: string): Promise<string> {
    const fctx = OIDCService.flowCtx(ctx);
    const c = await this.flow.challenge(fctx, ChallengeLogout, challenge);
    await this.flow.decideChallenge(fctx, challenge, c.subject, []);
    if (c.postLogoutRedirectUri === '') return `${this.issuerValue}/`;
    return redirectWith(c.postLogoutRedirectUri, { state: c.state });
  }

  /**
   * parseIDTokenHint нь RP-ийн logout дээр өгсөн id_token_hint-ээс аль client,
   * аль иргэний тухай яриад байгааг гаргаж авна.
   *
   * Гарын үсгийг ЗААВАЛ шалгана — эс бөгөөс дурын хүн `aud`-аа сонгосон hint
   * зохиож, өөр апп-ийн нэрийн өмнөөс logout эхлүүлэх боломжтой болно.
   *
   * Хугацаа дууссаныг ЗӨВШӨӨРНӨ: hint нь ӨНГӨРСӨН session-ий тухай сануулга тул
   * хүчинтэй байх шаардлагагүй (спекц үүнийг тусгайлан зөвшөөрдөг).
   */
  private async parseIDTokenHint(
    ctx: Ctx,
    hint: string,
  ): Promise<{ clientId: string; subject: string }> {
    const keys = this.keys;
    if (!keys) throw badRequest('id_token_hint is not supported');

    const decoded = jwt.decode(hint, { complete: true });
    const kid = typeof decoded?.header.kid === 'string' ? decoded.header.kid : '';
    if (kid === '') throw badRequest('id_token_hint could not be verified');

    let claims: jwt.JwtPayload;
    try {
      const pub = await keys.publicKey(ctx, kid);
      const verified = jwt.verify(hint, pub, {
        algorithms: ['RS256'],
        // exp-ийг САНААТАЙГААР алгасна (дээрх тайлбарыг үз).
        ignoreExpiration: true,
        ignoreNotBefore: true,
      });
      if (typeof verified === 'string') throw new Error('unexpected string payload');
      claims = verified;
    } catch {
      throw badRequest('id_token_hint could not be verified');
    }

    if (claims.iss !== this.issuerValue) {
      throw badRequest('id_token_hint was issued by someone else');
    }
    const subject = typeof claims.sub === 'string' ? claims.sub : '';
    let clientId = '';
    if (typeof claims.aud === 'string') clientId = claims.aud;
    else if (Array.isArray(claims.aud) && typeof claims.aud[0] === 'string')
      clientId = claims.aud[0];
    if (clientId === '') throw badRequest('id_token_hint has no audience');
    return { clientId, subject };
  }
}

/** newOIDCService нь протоколын service-ийг үүсгэнэ. */
export const newOIDCService = (
  clients: OAuthClientRepository,
  flow: OAuthFlowRepository,
  issuer: string,
): OIDCService => new OIDCService(clients, flow, issuer);
