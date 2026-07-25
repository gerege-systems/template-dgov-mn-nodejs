// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Provider (login/consent/logout зохицуулалт)-ийн unit тестүүд.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type {
  OAuthClientRepository,
  OAuthFlowRepository,
} from '../../datasources/repositories/interface/oauth.js';
import { ChallengeLogin } from '../../domain/oauth.js';
import type { OAuthChallenge, OAuthClient } from '../../domain/oauth.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { newOIDCService } from '../oidc/oidc_service.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { newProviderUsecase } from './provider_usecase.js';

const ctx: Ctx = background();
const issuer = 'https://sso.example.mn';

const client: OAuthClient = {
  clientId: 'app-1',
  clientName: 'Гуравдагч апп',
  secretHash: '',
  tokenEndpointAuthMethod: 'none',
  appType: 'spa',
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  scopes: ['openid', 'profile'],
  redirectUris: ['https://app.example.mn/callback', 'https://other.example.mn/cb'],
  postLogoutRedirectUris: [],
  tags: [],
  enabled: true,
  createdBy: '',
  createdAt: new Date(),
  updatedAt: null,
};

const challenge = (over: Partial<OAuthChallenge> = {}): OAuthChallenge => ({
  challenge: 'ch-1',
  kind: ChallengeLogin,
  clientId: 'app-1',
  subject: '',
  requestedScopes: ['openid', 'profile'],
  grantedScopes: [],
  redirectUri: 'https://app.example.mn/callback',
  state: 'st',
  nonce: '',
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

function clientsRepo(c: OAuthClient | null = client): OAuthClientRepository {
  return {
    list: () => Promise.resolve([]),
    get: () => (c ? Promise.resolve(c) : Promise.reject(notFound('client not found'))),
    create: () => Promise.reject(new Error('unused')),
    update: () => Promise.reject(new Error('unused')),
    setSecretHash: () => Promise.resolve(),
    deleteClient: () => Promise.resolve(),
  };
}

function flowRepo(over: Partial<OAuthFlowRepository> = {}): OAuthFlowRepository {
  return {
    createChallenge: () => Promise.resolve(),
    challenge: () => Promise.resolve(challenge()),
    decideChallenge: () => Promise.resolve(),
    consent: () => Promise.resolve([]),
    saveConsent: () => Promise.resolve(),
    revokeConsent: () => Promise.resolve(),
    createCode: () => Promise.resolve(),
    consumeCode: () => Promise.reject(notFound('unused')),
    storeTokens: () => Promise.resolve(),
    accessToken: () => Promise.reject(notFound('unused')),
    consumeRefreshToken: () => Promise.reject(notFound('unused')),
    revokeFamily: () => Promise.resolve(),
    revokeForSubjectClient: () => Promise.resolve(),
    revokeAccessToken: () => Promise.resolve(false),
    revokeRefreshToken: () => Promise.resolve(false),
    deleteExpired: () => Promise.resolve(),
    ...over,
  };
}

const usersOk = { getById: () => Promise.resolve({ user: {} }) } as unknown as UsersUsecase;
const usersMissing = {
  getById: () => Promise.reject(notFound('user not found')),
} as unknown as UsersUsecase;

function build(
  opts: {
    flow?: Partial<OAuthFlowRepository>;
    clients?: OAuthClientRepository;
    users?: UsersUsecase;
    firstParty?: string[];
  } = {},
) {
  const clients = opts.clients ?? clientsRepo();
  const svc = newOIDCService(clients, flowRepo(opts.flow), issuer);
  return newProviderUsecase(svc, clients, opts.users ?? usersOk, opts.firstParty ?? [], issuer);
}

describe('getLogin / getConsent', () => {
  it('challenge хоосон бол 400', async () => {
    const uc = build();
    await expect(uc.getLogin(ctx, '  ')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
    await expect(uc.getConsent(ctx, '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('апп-ийн харагдах нэрийг буцаана', async () => {
    const info = await build().getLogin(ctx, 'ch-1');
    expect(info.clientName).toBe('Гуравдагч апп');
    expect(info.requestedScope).toEqual(['openid', 'profile']);
    // Нэвтрэлт нь платформын session тул skip ҮРГЭЛЖ false.
    expect(info.skip).toBe(false);
  });

  it('client уншигдахгүй бол client_id-г нэр болгож үзүүлнэ (fail-open)', async () => {
    const info = await build({ clients: clientsRepo(null) }).getLogin(ctx, 'ch-1');
    expect(info.clientName).toBe('app-1');
  });

  it('first-party апп-д consent UI алгасна', async () => {
    const uc = build({
      firstParty: ['app-1'],
      flow: { challenge: () => Promise.resolve(challenge({ subject: 'user-1' })) },
    });
    expect((await uc.getConsent(ctx, 'ch-1')).skip).toBe(true);
  });

  it('санагдсан зөвшөөрөл байвал challenge-ийн skip хүндэтгэгдэнэ', async () => {
    const uc = build({ flow: { challenge: () => Promise.resolve(challenge({ skip: true })) } });
    expect((await uc.getConsent(ctx, 'ch-1')).skip).toBe(true);
  });
});

describe('loginAppContext', () => {
  it('first-party client нь хоосон (SSO өөрөө)', async () => {
    const out = await build({ firstParty: ['app-1'] }).loginAppContext(ctx, 'ch-1');
    expect(out).toEqual({ rpApp: '', rpAppUrl: '' });
  });

  it('гуравдагч апп-д нэр + эхний redirect origin', async () => {
    const out = await build().loginAppContext(ctx, 'ch-1');
    expect(out).toEqual({ rpApp: 'Гуравдагч апп', rpAppUrl: 'https://app.example.mn' });
  });

  it('challenge олдохгүй бол хоосон (нэвтрэлтийг БЛОКЛОХГҮЙ)', async () => {
    const uc = build({ flow: { challenge: () => Promise.reject(notFound('gone')) } });
    expect(await uc.loginAppContext(ctx, 'ch-x')).toEqual({ rpApp: '', rpAppUrl: '' });
    expect(await uc.loginAppContext(ctx, '')).toEqual({ rpApp: '', rpAppUrl: '' });
  });
});

describe('acceptLogin / acceptConsent', () => {
  it('нэвтрээгүй бол 401', async () => {
    await expect(build().acceptLogin(ctx, '', 'ch-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Unauthorized),
    );
  });

  it('challenge-гүй бол 400', async () => {
    await expect(build().acceptLogin(ctx, 'user-1', '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('амжилттай бол consent хуудас руу чиглүүлнэ', async () => {
    const redirect = await build().acceptLogin(ctx, 'user-1', 'ch-1');
    const url = new URL(redirect);
    expect(url.origin + url.pathname).toBe(`${issuer}/oauth/consent`);
    expect(url.searchParams.get('consent_challenge')).toHaveLength(43);
  });

  it('иргэний бүртгэл олдохгүй бол consent олгогдохгүй (fail-closed)', async () => {
    const createCode = vi.fn(() => Promise.resolve());
    const uc = build({
      users: usersMissing,
      flow: {
        challenge: () => Promise.resolve(challenge({ subject: 'user-1' })),
        createCode,
      },
    });
    await expect(uc.acceptConsent(ctx, 'user-1', 'ch-1', [])).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Internal),
    );
    expect(createCode).not.toHaveBeenCalled();
  });

  it('нэвтрээгүй consent нь 403', async () => {
    await expect(build().acceptConsent(ctx, '', 'ch-1', [])).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });
});

describe('reject / logout', () => {
  it('шалтгаангүй татгалзалд өгөгдмөл текст орно', async () => {
    const redirect = await build().rejectLogin(ctx, 'ch-1', '');
    const url = new URL(redirect);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('error_description')).toBe('хэрэглэгч нэвтрэлтийг цуцлав');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('өгсөн шалтгаан дамжина', async () => {
    const url = new URL(await build().rejectConsent(ctx, 'ch-1', 'болих'));
    expect(url.searchParams.get('error_description')).toBe('болих');
  });

  it('logout challenge хоосон бол 400', async () => {
    await expect(build().acceptLogout(ctx, '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });
});
