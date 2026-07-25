// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Гарын үсгийн түлхүүр + id_token-ий БҮТЭН ЭРГЭЛТ: сервер id_token гаргаж,
// нийтлэгдсэн JWKS-ээр (RP-ийн хийдэг ажил) шалгагдаж байгааг батална.

import { createPublicKey } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { notFound } from '../../apperror/index.js';
import type { OAuthKeyRepository } from '../../datasources/repositories/interface/oauth.js';
import type { OAuthClient, SigningKey } from '../../domain/oauth.js';
import type { User } from '../../domain/users.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { claimsForScopes } from './claims.js';
import { buildDiscovery } from './discovery.js';
import { newKeyManager } from './keys.js';
import { newOIDCService } from './oidc_service.js';
import type { OAuthAccessToken, OAuthAuthCode, OAuthRefreshToken } from '../../domain/oauth.js';
import type {
  OAuthClientRepository,
  OAuthFlowRepository,
} from '../../datasources/repositories/interface/oauth.js';

const ctx: Ctx = background();
const issuer = 'https://sso.example.mn';
const encKey = 'test-encryption-key-for-oidc-signing-keys';

function memoryKeyStore(): OAuthKeyRepository {
  const keys: SigningKey[] = [];
  return {
    active: () => {
      const k = keys.find((x) => x.active);
      return k ? Promise.resolve(k) : Promise.reject(notFound('no active signing key'));
    },
    all: () => Promise.resolve([...keys]),
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

const user: User = {
  id: 'user-1',
  firstName: 'Бат',
  lastName: 'Дорж',
  firstNameEn: 'Bat',
  lastNameEn: 'Dorj',
  email: 'bat@example.mn',
  nationalId: 'УБ00112233',
  civilId: '123456789',
  googleSub: 'g-1',
  googleEmail: 'bat@gmail.com',
  googleName: 'Bat D',
  googlePicture: 'https://pic',
} as User;

describe('KeyManager', () => {
  it('эхний ажиллагаанд түлхүүр үүсгэж JWKS-д нийтэлнэ', async () => {
    const km = newKeyManager(memoryKeyStore(), encKey);
    await km.ensureKey(ctx);
    const set = await km.jwks(ctx);
    expect(set.keys).toHaveLength(1);
    expect(set.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
    // Хувийн бүрэлдэхүүн ХЭЗЭЭ Ч JWKS-д гарахгүй.
    expect(JSON.stringify(set.keys[0])).not.toContain('"d"');
  });

  it('ensureKey нь давхар түлхүүр үүсгэхгүй (идемпотент)', async () => {
    const km = newKeyManager(memoryKeyStore(), encKey);
    await km.ensureKey(ctx);
    await km.ensureKey(ctx);
    expect((await km.jwks(ctx)).keys).toHaveLength(1);
  });

  it('rotate нь шинэ kid өгч, ХУУЧНЫГ JWKS-д үлдээнэ', async () => {
    const km = newKeyManager(memoryKeyStore(), encKey);
    await km.ensureKey(ctx);
    const first = (await km.signer(ctx)).kid;
    const second = await km.rotate(ctx);
    expect(second).not.toBe(first);
    // Хуучин түлхүүрээр зурсан id_token-ууд дуусах хүртэл шалгагдах ёстой.
    const kids = (await km.jwks(ctx)).keys.map((k) => k.kid);
    expect(kids).toContain(first);
    expect(kids).toContain(second);
    // Хуучин түлхүүр kid-ээр нь уншигдсаар байна.
    await expect(km.publicKey(ctx, first)).resolves.toBeDefined();
  });

  it('танихгүй kid нь NotFound', async () => {
    const km = newKeyManager(memoryKeyStore(), encKey);
    await km.ensureKey(ctx);
    await expect(km.publicKey(ctx, 'no-such-kid')).rejects.toThrow('signing key not found');
  });

  it('хадгалсан хувийн түлхүүрийг задалж дахин ашиглана (кэш хоосон ч)', async () => {
    const store = memoryKeyStore();
    const first = newKeyManager(store, encKey);
    await first.ensureKey(ctx);
    // ӨӨР instance — кэш хоосон тул шифрлэгдсэн түлхүүрийг DB-ээс задална.
    const second = newKeyManager(store, encKey);
    const { kid, key } = await second.signer(ctx);
    expect(kid).toHaveLength(43);
    expect(key.type).toBe('private');
  });
});

describe('id_token эргэлт', () => {
  const client: OAuthClient = {
    clientId: 'app-1',
    clientName: 'Апп',
    secretHash: '',
    tokenEndpointAuthMethod: 'none',
    appType: 'spa',
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scopes: ['openid', 'profile', 'email'],
    redirectUris: ['https://app.example.mn/callback'],
    postLogoutRedirectUris: [],
    tags: [],
    enabled: true,
    createdBy: '',
    createdAt: new Date(),
    updatedAt: null,
  };

  const code: OAuthAuthCode = {
    codeHash: Buffer.alloc(32),
    clientId: 'app-1',
    subject: 'user-1',
    scopes: ['openid', 'profile', 'email'],
    redirectUri: 'https://app.example.mn/callback',
    nonce: 'nonce-1',
    codeChallenge: '',
    codeChallengeMethod: '',
    authTime: new Date('2026-07-26T00:00:00Z'),
    expiresAt: new Date(Date.now() + 60_000),
  };

  const clients: OAuthClientRepository = {
    list: () => Promise.resolve([]),
    get: () => Promise.resolve(client),
    create: () => Promise.reject(new Error('unused')),
    update: () => Promise.reject(new Error('unused')),
    setSecretHash: () => Promise.resolve(),
    deleteClient: () => Promise.resolve(),
  };

  const flow: OAuthFlowRepository = {
    createChallenge: () => Promise.resolve(),
    challenge: () => Promise.reject(notFound('unused')),
    decideChallenge: () => Promise.resolve(),
    consent: () => Promise.resolve([]),
    saveConsent: () => Promise.resolve(),
    revokeConsent: () => Promise.resolve(),
    createCode: () => Promise.resolve(),
    consumeCode: () => Promise.resolve({ code, alreadyUsed: false }),
    storeTokens: (_c: Ctx, _at: OAuthAccessToken, _rt: OAuthRefreshToken | null) =>
      Promise.resolve(),
    accessToken: () => Promise.reject(notFound('unused')),
    consumeRefreshToken: () => Promise.reject(notFound('unused')),
    revokeFamily: () => Promise.resolve(),
    revokeForSubjectClient: () => Promise.resolve(),
    revokeAccessToken: () => Promise.resolve(false),
    revokeRefreshToken: () => Promise.resolve(false),
    deleteExpired: () => Promise.resolve(),
  };

  const users = {
    getById: () => Promise.resolve({ user }),
  } as unknown as UsersUsecase;

  it('гаргасан id_token нь НИЙТЛЭГДСЭН JWKS-ээр шалгагдана', async () => {
    const km = newKeyManager(memoryKeyStore(), encKey);
    await km.ensureKey(ctx);
    const svc = newOIDCService(clients, flow, issuer).withTokenIssuing(km, users);

    const out = await svc.token(ctx, {
      grantType: 'authorization_code',
      code: 'the-code',
      redirectUri: 'https://app.example.mn/callback',
      codeVerifier: '',
      refreshToken: '',
      scope: '',
      clientId: 'app-1',
      clientSecret: '',
      secretFromBasic: false,
    });
    expect(out.id_token).toBeTruthy();

    // RP-ийн хийдэг ажил: header-ийн kid-ээр JWKS-ээс түлхүүр олж шалгах.
    const header = jwt.decode(out.id_token ?? '', { complete: true })?.header;
    expect(header?.alg).toBe('RS256');
    const jwks = await km.jwks(ctx);
    const jwk = jwks.keys.find((k) => k.kid === header?.kid);
    expect(jwk).toBeDefined();

    const pub = createPublicKey({ key: jwk as never, format: 'jwk' });
    const claims = jwt.verify(out.id_token ?? '', pub, {
      algorithms: ['RS256'],
      issuer,
      audience: 'app-1',
    }) as jwt.JwtPayload;

    expect(claims.sub).toBe('user-1');
    expect(claims.nonce).toBe('nonce-1');
    expect(claims.auth_time).toBe(Math.floor(code.authTime.getTime() / 1000));
    expect(claims.name).toBe('Дорж Бат');
    expect(claims.email).toBe('bat@example.mn');
    expect(claims.email_verified).toBe(true);
    // Хүсээгүй scope-ийн claims ГАРАХГҮЙ.
    expect(claims.national_id).toBeUndefined();
    expect(claims.google_sub).toBeUndefined();
  });

  it('openid scope байхгүй бол id_token ГАРАХГҮЙ', async () => {
    const km = newKeyManager(memoryKeyStore(), encKey);
    await km.ensureKey(ctx);
    const noOpenId: OAuthFlowRepository = {
      ...flow,
      consumeCode: () =>
        Promise.resolve({ code: { ...code, scopes: ['profile'] }, alreadyUsed: false }),
    };
    const svc = newOIDCService(clients, noOpenId, issuer).withTokenIssuing(km, users);
    const out = await svc.token(ctx, {
      grantType: 'authorization_code',
      code: 'the-code',
      redirectUri: 'https://app.example.mn/callback',
      codeVerifier: '',
      refreshToken: '',
      scope: '',
      clientId: 'app-1',
      clientSecret: '',
      secretFromBasic: false,
    });
    expect(out.id_token).toBeUndefined();
  });
});

describe('claimsForScopes', () => {
  it('scope тус бүр өөрийн claims-ыг л нээнэ', () => {
    expect(claimsForScopes(['profile'], user)).toEqual({
      name: 'Дорж Бат',
      given_name: 'Бат',
      family_name: 'Дорж',
      given_name_en: 'Bat',
      family_name_en: 'Dorj',
    });
    expect(claimsForScopes(['nationalid'], user)).toEqual({
      national_id: 'УБ00112233',
      register_number: '123456789',
    });
  });

  it('google claims нь ЗӨВХӨН google scope-той үед (data minimization)', () => {
    expect(claimsForScopes(['openid', 'profile', 'email'], user).google_sub).toBeUndefined();
    expect(claimsForScopes(['google'], user)).toMatchObject({
      google_sub: 'g-1',
      google_email: 'bat@gmail.com',
    });
  });

  it('Google холбоогүй хэрэглэгчид google claims гарахгүй', () => {
    expect(claimsForScopes(['google'], { ...user, googleSub: '' })).toEqual({});
  });

  it('хоосон утгууд claims-д ОРОХГҮЙ', () => {
    const bare = { ...user, email: '', firstNameEn: '', lastNameEn: '' };
    const claims = claimsForScopes(['profile', 'email'], bare);
    expect(claims.email).toBeUndefined();
    expect(claims.email_verified).toBeUndefined();
    expect(claims.given_name_en).toBeUndefined();
  });
});

describe('discovery', () => {
  it('endpoint-ууд issuer дээр бүтнэ', () => {
    const d = buildDiscovery(issuer);
    expect(d.issuer).toBe(issuer);
    expect(d.authorization_endpoint).toBe(`${issuer}/oauth2/auth`);
    expect(d.jwks_uri).toBe(`${issuer}/.well-known/jwks.json`);
  });

  it('зөвхөн S256 PKCE болон code урсгалыг зарлана', () => {
    const d = buildDiscovery(issuer);
    expect(d.code_challenge_methods_supported).toEqual(['S256']);
    expect(d.response_types_supported).toEqual(['code']);
    expect(d.id_token_signing_alg_values_supported).toEqual(['RS256']);
  });

  it('дотоод svc:* scope-уудыг зарладаггүй (статик жагсаалт)', () => {
    const scopes = buildDiscovery(issuer).scopes_supported as string[];
    expect(scopes).toContain('openid');
    expect(scopes.some((s) => s.startsWith('svc:'))).toBe(false);
  });
});
