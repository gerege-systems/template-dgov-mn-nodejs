// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// applications usecase-ийн unit тестүүд. Гол зорилго:
//   • redirect_uri-ийн OAuth аюулгүй байдлын дүрэм (https / loopback / fragment)
//   • public (spa/native) client-д secret ОГТ үүсэхгүй, эргүүлэгдэхгүй
//   • түүхий secret зөвхөн create/rotate/set хариунд гарч, DB-д hash л очих
//   • update нь secret-д хүрэхгүй

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type {
  OAuthClientRepository,
  ServiceScopeResolver,
} from '../../datasources/repositories/interface/oauth.js';
import type { OAuthClient } from '../../domain/oauth.js';
import { background } from '../../pkg/ctx/ctx.js';
import { verify } from '../../pkg/secrethash/secrethash.js';
import { newApplicationsUsecase, type ApplicationInput } from './applications_usecase.js';

function client(over: Partial<OAuthClient> = {}): OAuthClient {
  return {
    clientId: 'app-0011223344556677',
    clientName: 'Тест апп',
    secretHash: '',
    tokenEndpointAuthMethod: 'client_secret_basic',
    appType: 'web',
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scopes: ['openid', 'profile', 'email'],
    redirectUris: ['https://rp.example.mn/callback'],
    postLogoutRedirectUris: ['https://rp.example.mn/'],
    tags: [],
    enabled: true,
    createdBy: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

function input(over: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    name: 'Тест апп',
    appType: 'web',
    redirectUris: ['https://rp.example.mn/callback'],
    tags: [],
    serviceIds: [],
    enabled: true,
    ...over,
  };
}

interface Stubs {
  clients?: Partial<OAuthClientRepository>;
  scopes?: string[];
  serviceIds?: string[];
}

function build(stubs: Stubs = {}) {
  const created: OAuthClient[] = [];
  const clients: OAuthClientRepository = {
    list: vi.fn(() => Promise.resolve([client()])),
    get: vi.fn(() => Promise.resolve(client())),
    create: vi.fn((_ctx: unknown, c: OAuthClient) => {
      created.push(c);
      return Promise.resolve(c);
    }),
    update: vi.fn((_ctx: unknown, c: OAuthClient) => Promise.resolve(c)),
    setSecretHash: vi.fn(() => Promise.resolve()),
    deleteClient: vi.fn(() => Promise.resolve()),
    ...stubs.clients,
  };
  const svc: ServiceScopeResolver = {
    serviceScopes: vi.fn(() => Promise.resolve(stubs.scopes ?? [])),
    serviceIdsForScopes: vi.fn(() => Promise.resolve(stubs.serviceIds ?? [])),
  };
  return { uc: newApplicationsUsecase(svc, clients), clients, svc, created };
}

describe('redirect_uri-ийн шалгалт', () => {
  it('https зөвшөөрөгдөнө', async () => {
    const { uc } = build();
    await expect(uc.create(background(), input())).resolves.toBeDefined();
  });

  it('http нь ЗӨВХӨН loopback дээр зөвшөөрөгдөнө', async () => {
    const { uc } = build();
    await expect(
      uc.create(background(), input({ redirectUris: ['http://localhost:3000/cb'] })),
    ).resolves.toBeDefined();
    await expect(
      uc.create(background(), input({ redirectUris: ['http://rp.example.mn/cb'] })),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('fragment агуулсан бол татгалзана (RFC 6749 §3.1.2)', async () => {
    const { uc } = build();
    await expect(
      uc.create(background(), input({ redirectUris: ['https://rp.example.mn/cb#token'] })),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('private-use scheme нь ЗӨВХӨН native апп-д зөвшөөрөгдөнө', async () => {
    const { uc } = build();
    await expect(
      uc.create(
        background(),
        input({ appType: 'native', redirectUris: ['myapp://oauth2/callback'] }),
      ),
    ).resolves.toBeDefined();
    await expect(
      uc.create(background(), input({ appType: 'web', redirectUris: ['myapp://oauth2/callback'] })),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('RP төрөлд redirect_uri дутвал 400', async () => {
    const { uc } = build();
    await expect(uc.create(background(), input({ redirectUris: [] }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });

  it('m2m нь redirect_uri-г ХАЯНА (client_credentials-д хэрэггүй)', async () => {
    const { uc, created } = build();
    await uc.create(
      background(),
      input({ appType: 'm2m', redirectUris: ['https://rp.example.mn/cb'] }),
    );
    expect(created[0]?.redirectUris).toEqual([]);
    expect(created[0]?.grantTypes).toEqual(['client_credentials']);
  });
});

describe('client secret', () => {
  it('confidential (web) апп-д secret үүсч, DB-д ЗӨВХӨН hash очно', async () => {
    const { uc, created } = build();
    const app = await uc.create(background(), input());

    expect(app.secret).toHaveLength(40);
    const stored = created[0]?.secretHash ?? '';
    expect(stored).toMatch(/^\$argon2id\$/);
    // Хадгалагдсан hash нь буцаасан secret-тэй ТААРНА.
    await expect(verify(stored, app.secret)).resolves.toBe(true);
    // Түүхий secret DB-д ХЭЗЭЭ Ч очихгүй.
    expect(stored).not.toContain(app.secret);
  });

  it('public (spa) апп-д secret ОГТ үүсэхгүй', async () => {
    const { uc, created } = build();
    const app = await uc.create(
      background(),
      input({ appType: 'spa', redirectUris: ['https://rp.example.mn/cb'] }),
    );
    expect(app.secret).toBe('');
    expect(created[0]?.secretHash).toBe('');
    // Public client — PKCE заавал болохын тулд auth method нь `none`.
    expect(created[0]?.tokenEndpointAuthMethod).toBe('none');
  });

  it('public апп-ын secret эргүүлэх оролдлого 400', async () => {
    const { uc, clients } = build({
      clients: { get: vi.fn(() => Promise.resolve(client({ appType: 'spa' }))) },
    });
    await expect(uc.rotateSecret(background(), 'app-1')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    expect(clients.setSecretHash).not.toHaveBeenCalled();
  });

  it('эргүүлэхэд шинэ secret нэг удаа буцаж, hash хадгалагдана', async () => {
    const setSecretHash = vi.fn((_ctx: unknown, _id: string, _hash: string) => Promise.resolve());
    const { uc } = build({ clients: { setSecretHash } });

    const app = await uc.rotateSecret(background(), 'app-1');

    expect(app.secret).toHaveLength(40);
    const stored = setSecretHash.mock.calls[0]?.[2] ?? '';
    await expect(verify(stored, app.secret)).resolves.toBe(true);
  });

  it('гараар оноох secret нь хэт богино/урт бол 400', async () => {
    const { uc, clients } = build();
    await expect(uc.setSecret(background(), 'app-1', 'short')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    await expect(uc.setSecret(background(), 'app-1', 'x'.repeat(129))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(clients.setSecretHash).not.toHaveBeenCalled();
  });

  it('update нь secret_hash-д ХҮРЭХГҮЙ', async () => {
    const { uc, clients } = build();
    await uc.update(background(), 'app-1', input({ name: 'Шинэ нэр' }));
    expect(clients.setSecretHash).not.toHaveBeenCalled();
  });
});

describe('scope ↔ service хөрвүүлэлт', () => {
  it('RP төрөлд base OIDC scope + service scope нэгтгэгдэнэ', async () => {
    const { uc, created } = build({ scopes: ['svc:billing', 'svc:registry'] });
    await uc.create(background(), input({ serviceIds: ['s1', 's2'] }));
    expect(created[0]?.scopes).toEqual([
      'openid',
      'profile',
      'email',
      'svc:billing',
      'svc:registry',
    ]);
  });

  it('m2m-д base OIDC scope НЭМЭГДЭХГҮЙ', async () => {
    const { uc, created } = build({ scopes: ['svc:billing'] });
    await uc.create(background(), input({ appType: 'm2m', serviceIds: ['s1'] }));
    expect(created[0]?.scopes).toEqual(['svc:billing']);
  });

  it('хадгалагдсан svc:* scope-оос service id-ууд сэргээгдэнэ', async () => {
    const serviceIdsForScopes = vi.fn((_ctx: unknown, scopes: string[]) => {
      // ЗӨВХӨН svc:* scope дамжина — openid/profile дамжих ЁСГҮЙ.
      expect(scopes).toEqual(['svc:billing']);
      return Promise.resolve(['11111111-1111-1111-1111-111111111111']);
    });
    const svc: ServiceScopeResolver = {
      serviceScopes: vi.fn(() => Promise.resolve([])),
      serviceIdsForScopes,
    };
    const clients: OAuthClientRepository = {
      list: vi.fn(() => Promise.resolve([])),
      get: vi.fn(() => Promise.resolve(client({ scopes: ['openid', 'profile', 'svc:billing'] }))),
      create: vi.fn((_c: unknown, c: OAuthClient) => Promise.resolve(c)),
      update: vi.fn((_c: unknown, c: OAuthClient) => Promise.resolve(c)),
      setSecretHash: vi.fn(() => Promise.resolve()),
      deleteClient: vi.fn(() => Promise.resolve()),
    };

    const app = await newApplicationsUsecase(svc, clients).get(background(), 'app-1');

    expect(app.serviceIds).toEqual(['11111111-1111-1111-1111-111111111111']);
  });
});

describe('бусад', () => {
  it('устгах нь ИДЕМПОТЕНТ (аль хэдийн байхгүй бол ч амжилттай)', async () => {
    const { uc } = build({
      clients: { deleteClient: vi.fn(() => Promise.reject(notFound('application not found'))) },
    });
    await expect(uc.deleteApp(background(), 'app-1')).resolves.toBeUndefined();
  });

  it('нэр хоосон / хэт урт бол 400', async () => {
    const { uc } = build();
    await expect(uc.create(background(), input({ name: '  ' }))).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    await expect(uc.create(background(), input({ name: 'x'.repeat(129) }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });

  it('танихгүй app_type нь 400', async () => {
    const { uc } = build();
    await expect(uc.create(background(), input({ appType: 'desktop' }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });

  it('post_logout_redirect_uris нь redirect-ийн гарал үүслээс гарна', async () => {
    const { uc, created } = build();
    await uc.create(
      background(),
      input({
        redirectUris: [
          'https://rp.example.mn/cb',
          'https://rp.example.mn/other',
          'https://b.mn/cb',
        ],
      }),
    );
    // Ижил origin давхардахгүй.
    expect(created[0]?.postLogoutRedirectUris).toEqual(['https://rp.example.mn/', 'https://b.mn/']);
  });
});
