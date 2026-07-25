// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// OIDC provider-ийн протоколын тестүүд. Гол баталгаанууд:
//   • redirect_uri ЯГ тулгагдана; баталгаажаагүй хаяг руу ХЭЗЭЭ Ч чиглүүлэхгүй;
//   • PKCE: public client-д заавал, зөвхөн S256;
//   • authorization code нэг удаагийн — дахин ирвэл бүх token цуцлагдана;
//   • refresh эргэлт: дахин ашиглалт илэрвэл ГЭР БҮЛ бүхэлдээ цуцлагдана;
//   • client-ийн зарласан auth method хатуу (downgrade боломжгүй).

import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type {
  NewOAuthChallenge,
  OAuthClientRepository,
  OAuthFlowRepository,
} from '../../datasources/repositories/interface/oauth.js';
import {
  AuthMethodBasic,
  AuthMethodNone,
  AuthMethodPost,
  ChallengeLogin,
  GrantAuthorizationCode,
  GrantClientCredentials,
  GrantRefreshToken,
} from '../../domain/oauth.js';
import type {
  OAuthAccessToken,
  OAuthAuthCode,
  OAuthChallenge,
  OAuthClient,
  OAuthRefreshToken,
} from '../../domain/oauth.js';
import type { OAuthKeyRepository } from '../../datasources/repositories/interface/oauth.js';
import type { SigningKey } from '../../domain/oauth.js';
import type { User } from '../../domain/users.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { newKeyManager } from './keys.js';
import {
  AuthorizeError,
  newOIDCService,
  s256Challenge,
  TokenError,
  verifyPKCE,
} from './oidc_service.js';

const ctx: Ctx = background();
const issuer = 'https://sso.example.mn';

const client = (over: Partial<OAuthClient> = {}): OAuthClient => ({
  clientId: 'app-1',
  clientName: 'Тест апп',
  secretHash: '',
  tokenEndpointAuthMethod: AuthMethodNone,
  appType: 'spa',
  grantTypes: [GrantAuthorizationCode, GrantRefreshToken],
  responseTypes: ['code'],
  scopes: ['openid', 'profile', 'offline_access'],
  redirectUris: ['https://app.example.mn/callback'],
  postLogoutRedirectUris: ['https://app.example.mn/'],
  tags: [],
  enabled: true,
  createdBy: '',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: null,
  ...over,
});

const challengeRow = (over: Partial<OAuthChallenge> = {}): OAuthChallenge => ({
  challenge: 'ch-1',
  kind: ChallengeLogin,
  clientId: 'app-1',
  subject: '',
  requestedScopes: ['openid', 'profile'],
  grantedScopes: [],
  redirectUri: 'https://app.example.mn/callback',
  state: 'st-1',
  nonce: 'n-1',
  responseType: 'code',
  codeChallenge: '',
  codeChallengeMethod: '',
  prompt: '',
  postLogoutRedirectUri: '',
  skip: false,
  decidedAt: null,
  expiresAt: new Date(Date.now() + 600_000),
  createdAt: new Date(),
  ...over,
});

const authCode = (over: Partial<OAuthAuthCode> = {}): OAuthAuthCode => ({
  codeHash: Buffer.alloc(32),
  clientId: 'app-1',
  subject: 'user-1',
  scopes: ['openid'],
  redirectUri: 'https://app.example.mn/callback',
  nonce: '',
  codeChallenge: '',
  codeChallengeMethod: '',
  authTime: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});

const refreshToken = (over: Partial<OAuthRefreshToken> = {}): OAuthRefreshToken => ({
  tokenHash: Buffer.alloc(32),
  familyId: 'fam-1',
  clientId: 'app-1',
  subject: 'user-1',
  scopes: ['openid', 'offline_access'],
  nonce: '',
  authTime: new Date(),
  expiresAt: new Date(Date.now() + 600_000),
  ...over,
});

function fakeClients(c: OAuthClient | null): OAuthClientRepository {
  return {
    list: () => Promise.resolve([]),
    get: () => (c ? Promise.resolve(c) : Promise.reject(notFound('client not found'))),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    setSecretHash: () => Promise.resolve(),
    deleteClient: () => Promise.resolve(),
  };
}

function fakeFlow(over: Partial<OAuthFlowRepository> = {}): OAuthFlowRepository {
  return {
    createChallenge: () => Promise.resolve(),
    challenge: () => Promise.resolve(challengeRow()),
    decideChallenge: () => Promise.resolve(),
    consent: () => Promise.resolve([]),
    saveConsent: () => Promise.resolve(),
    revokeConsent: () => Promise.resolve(),
    createCode: () => Promise.resolve(),
    consumeCode: () => Promise.resolve({ code: authCode(), alreadyUsed: false }),
    storeTokens: () => Promise.resolve(),
    accessToken: () => Promise.reject(notFound('token not found')),
    consumeRefreshToken: () => Promise.resolve({ token: refreshToken(), reused: false }),
    revokeFamily: () => Promise.resolve(),
    revokeForSubjectClient: () => Promise.resolve(),
    revokeAccessToken: () => Promise.resolve(false),
    revokeRefreshToken: () => Promise.resolve(false),
    deleteExpired: () => Promise.resolve(),
    ...over,
  };
}

/** memoryKeyStore нь тестэд зориулсан санах ойн түлхүүрийн хадгалалт. */
function memoryKeyStore(): OAuthKeyRepository {
  const keys: SigningKey[] = [];
  return {
    active: (_c: Ctx) => {
      const k = keys.find((x) => x.active);
      return k ? Promise.resolve(k) : Promise.reject(notFound('no active signing key'));
    },
    all: () => Promise.resolve(keys),
    insert: (_c: Ctx, k) => {
      keys.push({ ...k, createdAt: new Date(), retiredAt: null });
      return Promise.resolve();
    },
    retireActive: () => {
      for (const k of keys) k.active = false;
      return Promise.resolve();
    },
  };
}

/** fakeUsers нь id_token/userinfo-д хэрэгтэй getById-г л хангана. */
function fakeUsers(user: Partial<User> = {}): UsersUsecase {
  const full: User = {
    id: 'user-1',
    username: 'иргэн',
    firstName: 'Бат',
    lastName: 'Дорж',
    firstNameEn: 'Bat',
    lastNameEn: 'Dorj',
    email: 'bat@example.mn',
    nationalId: 'УБ00112233',
    civilId: '123456789',
    googleSub: '',
    googleEmail: '',
    googleName: '',
    googlePicture: '',
    ...user,
  } as User;
  return { getById: () => Promise.resolve({ user: full }) } as unknown as UsersUsecase;
}

/**
 * withTokens нь бодит KeyManager (RSA түлхүүр) болон иргэний бүртгэлтэй
 * service үүсгэнэ — id_token нь ҮНЭХЭЭР гарын үсэг зурагдана.
 */
async function withTokens(
  clients: OAuthClientRepository,
  flow: OAuthFlowRepository,
): Promise<ReturnType<typeof newOIDCService>> {
  const svc = newOIDCService(clients, flow, issuer);
  const keys = newKeyManager(memoryKeyStore(), 'test-encryption-key-for-oidc-signing-keys');
  // Boot дээр хийгддэгтэй ижил: эхний RSA түлхүүрийг үүсгэнэ.
  await keys.ensureKey(ctx);
  return svc.withTokenIssuing(keys, fakeUsers());
}

const authorizeReq = (
  over: Partial<Parameters<ReturnType<typeof newOIDCService>['authorize']>[1]> = {},
) => ({
  clientId: 'app-1',
  redirectUri: 'https://app.example.mn/callback',
  responseType: 'code',
  scope: 'openid profile',
  state: 'st-1',
  nonce: 'n-1',
  codeChallenge: s256Challenge('verifier-123'),
  codeChallengeMethod: 'S256',
  prompt: '',
  ...over,
});

describe('authorize', () => {
  it('зөв хүсэлтэд login challenge үүсгэж, олгогдох scope-ыг хадгална', async () => {
    let saved: NewOAuthChallenge | null = null;
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        createChallenge: (_c: Ctx, ch: NewOAuthChallenge) => {
          saved = ch;
          return Promise.resolve();
        },
      }),
      issuer,
    );
    const out = await svc.authorize(ctx, authorizeReq());
    expect(out.challenge).toHaveLength(43); // 32 байт base64url
    const ch = saved as unknown as NewOAuthChallenge;
    expect(ch.kind).toBe(ChallengeLogin);
    // Client-д олгогдоогүй scope шүүгдэнэ (эрх өсгөх боломжгүй).
    expect(ch.requestedScopes).toEqual(['openid', 'profile']);
  });

  it('танихгүй client нь redirect ХИЙХГҮЙ алдаа', async () => {
    const svc = newOIDCService(fakeClients(null), fakeFlow(), issuer);
    const err = await svc.authorize(ctx, authorizeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthorizeError);
    expect((err as AuthorizeError).code).toBe('invalid_client');
    expect((err as AuthorizeError).canRedirect()).toBe(false);
  });

  it('бүртгэлгүй redirect_uri рүү ХЭЗЭЭ Ч чиглүүлэхгүй', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authorize(ctx, authorizeReq({ redirectUri: 'https://evil.example.mn/steal' }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthorizeError);
    expect((err as AuthorizeError).canRedirect()).toBe(false);
    expect((err as AuthorizeError).description).toContain('redirect_uri');
  });

  it('prefix-ээр таарах хаяг ч ТАТГАЛЗАНА (яг тулгалт)', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authorize(ctx, authorizeReq({ redirectUri: 'https://app.example.mn/callback.evil' }))
      .catch((e: unknown) => e);
    expect((err as AuthorizeError).canRedirect()).toBe(false);
  });

  it('идэвхгүй client нь redirect-гүй алдаа', async () => {
    const svc = newOIDCService(fakeClients(client({ enabled: false })), fakeFlow(), issuer);
    const err = await svc.authorize(ctx, authorizeReq()).catch((e: unknown) => e);
    expect((err as AuthorizeError).code).toBe('unauthorized_client');
    expect((err as AuthorizeError).canRedirect()).toBe(false);
  });

  it('redirect_uri зөв бол цаашдын алдааг RP руу буцаана', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authorize(ctx, authorizeReq({ responseType: 'token' }))
      .catch((e: unknown) => e);
    const authErr = err as AuthorizeError;
    expect(authErr.code).toBe('unsupported_response_type');
    expect(authErr.canRedirect()).toBe(true);
    const url = new URL(authErr.redirectUrl());
    expect(url.origin + url.pathname).toBe('https://app.example.mn/callback');
    expect(url.searchParams.get('error')).toBe('unsupported_response_type');
    expect(url.searchParams.get('state')).toBe('st-1');
  });

  it('public client-д PKCE ЗААВАЛ', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authorize(ctx, authorizeReq({ codeChallenge: '', codeChallengeMethod: '' }))
      .catch((e: unknown) => e);
    expect((err as AuthorizeError).description).toContain('code_challenge is required');
  });

  it('plain PKCE арга ТАТГАЛЗАНА (зөвхөн S256)', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authorize(ctx, authorizeReq({ codeChallengeMethod: 'plain' }))
      .catch((e: unknown) => e);
    expect((err as AuthorizeError).description).toContain('S256');
  });

  it('олгогдоогүй scope л хүсвэл invalid_scope', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authorize(ctx, authorizeReq({ scope: 'svc:secret' }))
      .catch((e: unknown) => e);
    expect((err as AuthorizeError).code).toBe('invalid_scope');
  });

  it('code grant-гүй client нь authorize хийхгүй', async () => {
    const svc = newOIDCService(
      fakeClients(client({ grantTypes: [GrantClientCredentials] })),
      fakeFlow(),
      issuer,
    );
    const err = await svc.authorize(ctx, authorizeReq()).catch((e: unknown) => e);
    expect((err as AuthorizeError).code).toBe('unauthorized_client');
  });
});

describe('acceptLogin / acceptConsent', () => {
  it('санагдсан зөвшөөрөл хүссэнийг бүрэн хамарвал skip=true', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({ consent: () => Promise.resolve(['openid', 'profile', 'email']) }),
      issuer,
    );
    const out = await svc.acceptLogin(ctx, 'ch-1', 'user-1');
    expect(out.skip).toBe(true);
  });

  it('дутуу хамрах зөвшөөрөл нь skip=false', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({ consent: () => Promise.resolve(['openid']) }),
      issuer,
    );
    expect((await svc.acceptLogin(ctx, 'ch-1', 'user-1')).skip).toBe(false);
  });

  it('өөр иргэний consent challenge-ыг дуусгах нь 403', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({ challenge: () => Promise.resolve(challengeRow({ subject: 'user-1' })) }),
      issuer,
    );
    await expect(svc.acceptConsent(ctx, 'ch-2', 'user-2', [])).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('олгох scope нь хүссэнээс ХЭТРЭХГҮЙ', async () => {
    let stored: OAuthAuthCode | null = null;
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        challenge: () =>
          Promise.resolve(
            challengeRow({ subject: 'user-1', requestedScopes: ['openid', 'profile'] }),
          ),
        createCode: (_c: Ctx, code: OAuthAuthCode) => {
          stored = code;
          return Promise.resolve();
        },
      }),
      issuer,
    );
    const redirect = await svc.acceptConsent(ctx, 'ch-1', 'user-1', ['openid', 'email', 'admin']);
    expect((stored as unknown as OAuthAuthCode).scopes).toEqual(['openid']);
    const url = new URL(redirect);
    expect(url.searchParams.get('code')).toBeTruthy();
    expect(url.searchParams.get('state')).toBe('st-1');
  });

  it('UI юу ч заагаагүй бол хүссэн бүх scope олгогдоно', async () => {
    let stored: OAuthAuthCode | null = null;
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        challenge: () => Promise.resolve(challengeRow({ subject: 'user-1' })),
        createCode: (_c: Ctx, code: OAuthAuthCode) => {
          stored = code;
          return Promise.resolve();
        },
      }),
      issuer,
    );
    await svc.acceptConsent(ctx, 'ch-1', 'user-1', []);
    expect((stored as unknown as OAuthAuthCode).scopes).toEqual(['openid', 'profile']);
  });
});

describe('client баталгаажуулалт', () => {
  const tokenReq = (over: Record<string, unknown> = {}) => ({
    grantType: GrantAuthorizationCode,
    code: '',
    redirectUri: '',
    codeVerifier: '',
    refreshToken: '',
    scope: '',
    clientId: 'app-1',
    clientSecret: '',
    secretFromBasic: false,
    ...over,
  });

  it('public client secret илгээвэл ТАТГАЛЗАНА', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .authenticateClient(ctx, tokenReq({ clientSecret: 'oops' }))
      .catch((e: unknown) => e);
    expect((err as TokenError).code).toBe('invalid_client');
    expect((err as TokenError).status).toBe(401);
  });

  it('basic зарласан client биеттэй secret илгээвэл ТАТГАЛЗАНА (downgrade хаалт)', async () => {
    const svc = newOIDCService(
      fakeClients(client({ tokenEndpointAuthMethod: AuthMethodBasic, secretHash: 'x' })),
      fakeFlow(),
      issuer,
    );
    const err = await svc
      .authenticateClient(ctx, tokenReq({ clientSecret: 's', secretFromBasic: false }))
      .catch((e: unknown) => e);
    expect((err as TokenError).description).toContain('HTTP Basic');
  });

  it('post зарласан client Basic-аар ирвэл ТАТГАЛЗАНА', async () => {
    const svc = newOIDCService(
      fakeClients(client({ tokenEndpointAuthMethod: AuthMethodPost, secretHash: 'x' })),
      fakeFlow(),
      issuer,
    );
    const err = await svc
      .authenticateClient(ctx, tokenReq({ clientSecret: 's', secretFromBasic: true }))
      .catch((e: unknown) => e);
    expect((err as TokenError).description).toContain('client_secret_post');
  });

  it('танигдахгүй hash формат нь "буруу итгэмжлэл" (fail-closed)', async () => {
    const svc = newOIDCService(
      fakeClients(client({ tokenEndpointAuthMethod: AuthMethodPost, secretHash: 'garbage' })),
      fakeFlow(),
      issuer,
    );
    const err = await svc
      .authenticateClient(ctx, tokenReq({ clientSecret: 's' }))
      .catch((e: unknown) => e);
    expect((err as TokenError).description).toBe('invalid client credentials');
  });

  it('идэвхгүй client нь 401', async () => {
    const svc = newOIDCService(fakeClients(client({ enabled: false })), fakeFlow(), issuer);
    const err = await svc.authenticateClient(ctx, tokenReq()).catch((e: unknown) => e);
    expect((err as TokenError).status).toBe(401);
  });
});

describe('token: authorization_code', () => {
  const req = (over: Record<string, unknown> = {}) => ({
    grantType: GrantAuthorizationCode,
    code: 'the-code',
    redirectUri: 'https://app.example.mn/callback',
    codeVerifier: '',
    refreshToken: '',
    scope: '',
    clientId: 'app-1',
    clientSecret: '',
    secretFromBasic: false,
    ...over,
  });

  it('амжилттай солилцоонд access token гарна (offline_access-гүй бол refresh БАЙХГҮЙ)', async () => {
    const svc = await withTokens(fakeClients(client()), fakeFlow());
    const out = await svc.token(ctx, req());
    expect(out.access_token).toHaveLength(43);
    expect(out.refresh_token).toBeUndefined();
    expect(out.token_type).toBe('bearer');
    expect(out.expires_in).toBe(3600);
    // openid scope-той ч key manager залгаагүй тул id_token гарахгүй —
    // энэ тестэд scope нь зөвхөн "openid" биш эсэхийг шалгана.
    expect(out.scope).toBe('openid');
  });

  it('өөр client-д олгогдсон код нь invalid_grant', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        consumeCode: () =>
          Promise.resolve({ code: authCode({ clientId: 'other-app' }), alreadyUsed: false }),
      }),
      issuer,
    );
    const err = await svc.token(ctx, req()).catch((e: unknown) => e);
    expect((err as TokenError).code).toBe('invalid_grant');
    expect((err as TokenError).description).toContain('another client');
  });

  it('redirect_uri зөрвөл invalid_grant', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc
      .token(ctx, req({ redirectUri: 'https://app.example.mn/other' }))
      .catch((e: unknown) => e);
    expect((err as TokenError).description).toContain('redirect_uri');
  });

  it('дахин ашигласан код нь тухайн иргэн+апп-ийн БҮХ token-ыг цуцална', async () => {
    const revoke = vi.fn((_c: Ctx, _s: string, _cl: string) => Promise.resolve());
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        consumeCode: () => Promise.resolve({ code: authCode(), alreadyUsed: true }),
        revokeForSubjectClient: revoke,
      }),
      issuer,
    );
    const err = await svc.token(ctx, req()).catch((e: unknown) => e);
    expect((err as TokenError).description).toContain('already been used');
    expect(revoke).toHaveBeenCalledWith(expect.anything(), 'user-1', 'app-1');
  });

  it('PKCE verifier таарахгүй бол invalid_grant', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        consumeCode: () =>
          Promise.resolve({
            code: authCode({
              codeChallenge: s256Challenge('right'),
              codeChallengeMethod: 'S256',
            }),
            alreadyUsed: false,
          }),
      }),
      issuer,
    );
    const err = await svc.token(ctx, req({ codeVerifier: 'wrong' })).catch((e: unknown) => e);
    expect((err as TokenError).description).toContain('code_verifier');
  });

  it('offline_access байвал refresh token гарна', async () => {
    let stored: OAuthRefreshToken | null = null;
    const svc = await withTokens(
      fakeClients(client()),
      fakeFlow({
        consumeCode: () =>
          Promise.resolve({
            code: authCode({ scopes: ['openid', 'offline_access'] }),
            alreadyUsed: false,
          }),
        storeTokens: (_c: Ctx, _at: OAuthAccessToken, rt: OAuthRefreshToken | null) => {
          stored = rt;
          return Promise.resolve();
        },
      }),
    );
    const out = await svc.token(ctx, req());
    expect(out.refresh_token).toHaveLength(43);
    expect((stored as unknown as OAuthRefreshToken).familyId).toHaveLength(36);
  });
});

describe('token: refresh_token', () => {
  const req = (over: Record<string, unknown> = {}) => ({
    grantType: GrantRefreshToken,
    code: '',
    redirectUri: '',
    codeVerifier: '',
    refreshToken: 'the-refresh',
    scope: '',
    clientId: 'app-1',
    clientSecret: '',
    secretFromBasic: false,
    ...over,
  });

  it('дахин ашигласан refresh token нь ГЭР БҮЛийг бүхэлд нь цуцална', async () => {
    const revokeFamily = vi.fn((_c: Ctx, _f: string) => Promise.resolve());
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        consumeRefreshToken: () => Promise.resolve({ token: refreshToken(), reused: true }),
        revokeFamily,
      }),
      issuer,
    );
    const err = await svc.token(ctx, req()).catch((e: unknown) => e);
    expect((err as TokenError).description).toContain('already been used');
    expect(revokeFamily).toHaveBeenCalledWith(expect.anything(), 'fam-1');
  });

  it('өөр client-ийн refresh token нь мөн гэр бүлийг цуцална', async () => {
    const revokeFamily = vi.fn((_c: Ctx, _f: string) => Promise.resolve());
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        consumeRefreshToken: () =>
          Promise.resolve({ token: refreshToken({ clientId: 'other' }), reused: false }),
        revokeFamily,
      }),
      issuer,
    );
    await svc.token(ctx, req()).catch(() => undefined);
    expect(revokeFamily).toHaveBeenCalledOnce();
  });

  it('scope-ыг НАРИЙСГАЖ болно', async () => {
    const svc = await withTokens(fakeClients(client()), fakeFlow());
    const out = await svc.token(ctx, req({ scope: 'openid' }));
    expect(out.scope).toBe('openid');
  });

  it('scope ӨРГӨТГӨХ оролдлого нь invalid_scope', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc.token(ctx, req({ scope: 'admin' })).catch((e: unknown) => e);
    expect((err as TokenError).code).toBe('invalid_scope');
  });

  it('эргэлт нь ижил гэр бүлийг үргэлжлүүлнэ', async () => {
    let stored: OAuthRefreshToken | null = null;
    const svc = await withTokens(
      fakeClients(client()),
      fakeFlow({
        storeTokens: (_c: Ctx, _at: OAuthAccessToken, rt: OAuthRefreshToken | null) => {
          stored = rt;
          return Promise.resolve();
        },
      }),
    );
    await svc.token(ctx, req());
    expect((stored as unknown as OAuthRefreshToken).familyId).toBe('fam-1');
  });
});

describe('token: client_credentials', () => {
  const req = (over: Record<string, unknown> = {}) => ({
    grantType: GrantClientCredentials,
    code: '',
    redirectUri: '',
    codeVerifier: '',
    refreshToken: '',
    scope: '',
    clientId: 'm2m',
    clientSecret: '',
    secretFromBasic: false,
    ...over,
  });

  it('public client нь client_credentials хэрэглэж БОЛОХГҮЙ', async () => {
    const svc = newOIDCService(
      fakeClients(client({ grantTypes: [GrantClientCredentials] })),
      fakeFlow(),
      issuer,
    );
    const err = await svc.token(ctx, req()).catch((e: unknown) => e);
    expect((err as TokenError).code).toBe('invalid_client');
  });

  it('grant зөвшөөрөгдөөгүй бол unauthorized_client', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc.token(ctx, req()).catch((e: unknown) => e);
    expect((err as TokenError).code).toBe('unauthorized_client');
  });

  it('танигдаагүй grant_type нь unsupported_grant_type', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    const err = await svc.token(ctx, req({ grantType: 'password' })).catch((e: unknown) => e);
    expect((err as TokenError).code).toBe('unsupported_grant_type');
  });
});

describe('introspect / revoke', () => {
  const at: OAuthAccessToken = {
    tokenHash: Buffer.alloc(32),
    clientId: 'app-1',
    subject: 'user-1',
    scopes: ['openid', 'profile'],
    refreshFamily: '',
    expiresAt: new Date(Date.now() + 600_000),
  };

  it('өөрийн token-ыг active гэж хариулна', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({ accessToken: () => Promise.resolve(at) }),
      issuer,
    );
    const info = await svc.introspect(ctx, 'app-1', 'tok');
    expect(info.active).toBe(true);
    expect(info.sub).toBe('user-1');
    expect(info.scope).toBe('openid profile');
  });

  it('ӨӨР client-ийн token нь active=false (мэдээлэл алдагдахгүй)', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({ accessToken: () => Promise.resolve(at) }),
      issuer,
    );
    expect((await svc.introspect(ctx, 'other-app', 'tok')).active).toBe(false);
  });

  it('танигдаагүй token нь active=false', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    expect((await svc.introspect(ctx, 'app-1', 'tok')).active).toBe(false);
    expect((await svc.introspect(ctx, 'app-1', '')).active).toBe(false);
  });

  it('revoke нь hint-ийн дарааллаар оролдоод амжилттай хариулна', async () => {
    const revokeAccess = vi.fn((_c: Ctx, _h: Buffer, _cl: string) => Promise.resolve(false));
    const revokeRefresh = vi.fn((_c: Ctx, _h: Buffer, _cl: string) => Promise.resolve(true));
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({ revokeAccessToken: revokeAccess, revokeRefreshToken: revokeRefresh }),
      issuer,
    );
    await svc.revoke(ctx, client(), 'tok', 'refresh_token');
    expect(revokeRefresh).toHaveBeenCalledOnce();
    expect(revokeAccess).not.toHaveBeenCalled();
  });

  it('танигдаагүй token-ыг цуцлах нь ч АМЖИЛТТАЙ (RFC 7009)', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    await expect(svc.revoke(ctx, client(), 'tok', '')).resolves.toBeUndefined();
  });
});

describe('RP-initiated logout', () => {
  it('бүртгэлгүй post_logout_redirect_uri нь 400', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    await expect(
      svc.startLogout(ctx, 'app-1', '', 'https://evil.example.mn/', ''),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('client_id-гүй post_logout_redirect_uri нь 400', async () => {
    const svc = newOIDCService(fakeClients(client()), fakeFlow(), issuer);
    await expect(svc.startLogout(ctx, '', '', 'https://app.example.mn/', '')).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.BadRequest),
    );
  });

  it('бүртгэлтэй хаягтай бол challenge үүснэ', async () => {
    let saved: NewOAuthChallenge | null = null;
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        createChallenge: (_c: Ctx, ch: NewOAuthChallenge) => {
          saved = ch;
          return Promise.resolve();
        },
      }),
      issuer,
    );
    await svc.startLogout(ctx, 'app-1', '', 'https://app.example.mn/', 'st');
    expect((saved as unknown as NewOAuthChallenge).postLogoutRedirectUri).toBe(
      'https://app.example.mn/',
    );
  });

  it('буцах хаяггүй logout нь issuer-ийн нүүр рүү', async () => {
    const svc = newOIDCService(
      fakeClients(client()),
      fakeFlow({
        challenge: () => Promise.resolve(challengeRow({ postLogoutRedirectUri: '', state: '' })),
      }),
      issuer,
    );
    expect(await svc.acceptLogout(ctx, 'ch-1')).toBe(`${issuer}/`);
  });
});

describe('PKCE туслах', () => {
  it('S256 challenge нь sha256(verifier)-ийн base64url', () => {
    const expected = createHash('sha256').update('abc', 'utf8').digest('base64url');
    expect(s256Challenge('abc')).toBe(expected);
  });

  it('PKCE-гүй урсгалд verifier ч байх ЁСГҮЙ', () => {
    expect(verifyPKCE('', '', '')).toBe(true);
    expect(verifyPKCE('', '', 'extra')).toBe(false);
  });

  it('plain арга ХЭЗЭЭ Ч зөвшөөрөгдөхгүй', () => {
    expect(verifyPKCE('abc', 'plain', 'abc')).toBe(false);
  });

  it('зөв verifier таарна', () => {
    expect(verifyPKCE(s256Challenge('v-1'), 'S256', 'v-1')).toBe(true);
    expect(verifyPKCE(s256Challenge('v-1'), 'S256', 'v-2')).toBe(false);
  });
});
