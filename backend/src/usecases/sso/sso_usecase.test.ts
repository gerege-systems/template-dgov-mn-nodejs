// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// SSO нэвтрэлтийн usecase-ийн unit тестүүд. Гол зорилго:
//   • state нь НЭГ УДААГИЙН (replay/CSRF хаалттай)
//   • private платформд урьдчилан бүртгээгүй иргэн НЭВТРЭХГҮЙ, данс ч үүсэхгүй
//   • горим уншиж чадаагүй үед fail-OPEN болохгүй
//   • иргэний дугаартай бол civil_id-ээр таарч НЭГ данс болно (давхардалгүй)

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type { RedisCache } from '../../datasources/caches/redis.js';
import type {
  PlatformSettingsRepository,
  SSOUserInput,
  SSOUserRepository,
} from '../../datasources/repositories/interface/sso.js';
import { emptyUser } from '../../domain/users.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newJWTServiceWithRefresh } from '../../pkg/jwt/jwt.js';
import type { OIDCClient, Tokens, UserInfo } from '../../pkg/oidc/oidc.js';
import { newSSOUsecase } from './sso_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';

function userInfo(over: Partial<UserInfo> = {}): UserInfo {
  return {
    sub: 'pairwise-sub-1',
    name: '',
    given_name: 'Дорж',
    family_name: 'Бат',
    given_name_en: 'Dorj',
    family_name_en: 'Bat',
    email: '',
    email_verified: false,
    national_id: '',
    register_number: '',
    google_sub: '',
    google_email: '',
    google_name: '',
    google_picture: '',
    ...over,
  };
}

function tokens(): Tokens {
  return { accessToken: 'a', idToken: 'id-token', refreshToken: 'r', expiresIn: 3600 };
}

interface Setup {
  info?: UserInfo;
  accessMode?: string | null;
  authorized?: boolean;
  stateValid?: boolean;
}

function build(setup: Setup = {}) {
  const store = {
    upsertBySSOSub: vi.fn((_c: unknown, _s: string, _in: SSOUserInput) =>
      Promise.resolve({ ...emptyUser(), id: userId, username: 'sso_x' }),
    ),
    upsertByCivilID: vi.fn(
      (_c: unknown, _civ: string, _nat: string, _s: string, _in: SSOUserInput) =>
        Promise.resolve({ ...emptyUser(), id: userId, username: 'eid_x' }),
    ),
    authorizedByCivilOrNational: vi.fn(() => Promise.resolve(setup.authorized ?? false)),
  } satisfies SSOUserRepository;

  const redisStore = new Map<string, string>();
  const redis = {
    setTTL: vi.fn((_c: unknown, k: string, v: string) => {
      redisStore.set(k, v);
      return Promise.resolve();
    }),
    getDel: vi.fn((_c: unknown, k: string) => {
      const v = redisStore.get(k) ?? '';
      redisStore.delete(k);
      return Promise.resolve(v);
    }),
  } as unknown as RedisCache;

  const oidc = {
    configured: () => true,
    authCodeUrl: (state: string) => `https://sso.example/oauth2/auth?state=${state}`,
    exchange: vi.fn(() => Promise.resolve(tokens())),
    exchangePKCE: vi.fn(() => Promise.resolve(tokens())),
    userInfo: vi.fn(() => Promise.resolve(setup.info ?? userInfo())),
    logoutUrlFor: (hint: string) => `https://sso.example/logout?id_token_hint=${hint}`,
    logoutUrl: () => '',
    refresh: vi.fn(),
  } as unknown as OIDCClient;

  const access: PlatformSettingsRepository | null =
    setup.accessMode === null || setup.accessMode === undefined
      ? null
      : {
          getAccessMode: vi.fn(() =>
            setup.accessMode === 'ERROR'
              ? Promise.reject(new Error('db down'))
              : Promise.resolve(setup.accessMode as string),
          ),
          setAccessMode: vi.fn(() => Promise.resolve()),
        };

  const jwt = newJWTServiceWithRefresh('secret-secret-secret-secret', 'test', 2, 7);
  const uc = newSSOUsecase(oidc, store, jwt, redis, 'native-client', null, access);
  return { uc, store, redis, oidc, redisStore };
}

/** startAndState нь start дуудаж, үүссэн state-ийг буцаана. */
async function startAndState(uc: ReturnType<typeof build>['uc']): Promise<string> {
  const url = await uc.start(background());
  return new URL(url).searchParams.get('state') ?? '';
}

describe('start', () => {
  it('authorize URL-д state + nonce орно', async () => {
    const { uc, redisStore } = build();
    const url = await uc.start(background());
    const state = new URL(url).searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(redisStore.has(`sso:state:${state ?? ''}`)).toBe(true);
  });
});

describe('callback — state (CSRF/replay)', () => {
  it('хүчинтэй state нэвтрэлтийг гүйцээнэ', async () => {
    const { uc } = build();
    const state = await startAndState(uc);
    await expect(uc.complete(background(), state, 'code-1')).resolves.toMatchObject({
      user: { id: userId },
    });
  });

  it('ижил state-ийг ДАХИН ашиглах оролдлого 400 (нэг удаагийн)', async () => {
    const { uc } = build();
    const state = await startAndState(uc);
    await uc.complete(background(), state, 'code-1');
    await expect(uc.complete(background(), state, 'code-1')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
  });

  it('танихгүй state 400 — code солигдохгүй', async () => {
    const { uc, oidc } = build();
    await expect(uc.complete(background(), 'made-up', 'code-1')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    expect(oidc.exchange).not.toHaveBeenCalled();
  });

  it('state эсвэл code хоосон бол 400', async () => {
    const { uc } = build();
    await expect(uc.complete(background(), '', 'c')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    await expect(uc.complete(background(), 's', '  ')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
  });
});

describe('хандалтын горим (private платформ)', () => {
  it('public горимд хэн ч нэвтэрнэ', async () => {
    const { uc } = build({ accessMode: 'public' });
    const state = await startAndState(uc);
    await expect(uc.complete(background(), state, 'c')).resolves.toBeDefined();
  });

  it('private горимд бүртгэлгүй иргэн 403 — данс ҮҮСЭХГҮЙ', async () => {
    const { uc, store } = build({
      accessMode: 'private',
      authorized: false,
      info: userInfo({ register_number: 'АА00112233', national_id: 'УY1234' }),
    });
    const state = await startAndState(uc);
    await expect(uc.complete(background(), state, 'c')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
    expect(store.upsertByCivilID).not.toHaveBeenCalled();
    expect(store.upsertBySSOSub).not.toHaveBeenCalled();
  });

  it('private горимд урьдчилан бүртгэсэн иргэн нэвтэрнэ', async () => {
    const { uc, store } = build({
      accessMode: 'private',
      authorized: true,
      info: userInfo({ register_number: 'АА00112233' }),
    });
    const state = await startAndState(uc);
    await expect(uc.complete(background(), state, 'c')).resolves.toBeDefined();
    expect(store.upsertByCivilID).toHaveBeenCalled();
  });

  it('private горимд дугааргүй иргэн 403 (тодорхойлох аргагүй)', async () => {
    const { uc } = build({ accessMode: 'private', authorized: true, info: userInfo() });
    const state = await startAndState(uc);
    await expect(uc.complete(background(), state, 'c')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
  });

  it('горим уншиж чадаагүй бол нэвтрэлт ЗОГСОНО (fail-open БИШ)', async () => {
    const { uc, store } = build({ accessMode: 'ERROR' });
    const state = await startAndState(uc);
    await expect(uc.complete(background(), state, 'c')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
    expect(store.upsertBySSOSub).not.toHaveBeenCalled();
  });
});

describe('иргэнийг тодорхойлох', () => {
  it('иргэний дугаартай бол civil_id-ээр таарна (нэг данс)', async () => {
    const { uc, store } = build({
      info: userInfo({ register_number: 'АА00112233', national_id: 'УY9999' }),
    });
    const state = await startAndState(uc);
    await uc.complete(background(), state, 'c');

    const [, civ, nat, sub, input] = store.upsertByCivilID.mock.calls[0]!;
    expect(civ).toBe('АА00112233');
    // national_id нь eID-ийн адил ЖИЖИГ үсгээр хадгалагдана.
    expect(nat).toBe('уy9999');
    expect(sub).toBe('pairwise-sub-1');
    expect(input.username).toBe('eid_АА00112233');
  });

  it('дугааргүй бол pairwise sub-ээр (синтетик email)', async () => {
    const { uc, store } = build();
    const state = await startAndState(uc);
    await uc.complete(background(), state, 'c');

    const [, sub, input] = store.upsertBySSOSub.mock.calls[0]!;
    expect(sub).toBe('pairwise-sub-1');
    expect(input.username).toMatch(/^sso_[0-9a-f]{20}$/);
    expect(input.email).toMatch(/^sso_[0-9a-f]{20}@sso\.local$/);
  });

  it('given/family хоосон ч name байвал бүтэн нэрийг ашиглана', async () => {
    const { uc, store } = build({
      info: userInfo({ given_name: '', family_name: '', name: 'Дорж Бат' }),
    });
    const state = await startAndState(uc);
    await uc.complete(background(), state, 'c');
    expect(store.upsertBySSOSub.mock.calls[0]![2].lastName).toBe('Дорж Бат');
  });
});

describe('native (PKCE)', () => {
  it('state ШААРДАХГҮЙ (PKCE хамгаална)', async () => {
    const { uc } = build();
    await expect(
      uc.completeNative(background(), 'code', 'verifier-value', 'myapp://cb'),
    ).resolves.toBeDefined();
  });

  it('code эсвэл verifier дутвал 400', async () => {
    const { uc } = build();
    await expect(uc.completeNative(background(), '', 'v', 'myapp://cb')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });
});

describe('logout', () => {
  it('ref-ээр id_token-ыг авч logout URL байгуулна (нэг удаагийн)', async () => {
    const { uc } = build();
    const state = await startAndState(uc);
    const out = await uc.complete(background(), state, 'c');

    await expect(uc.logoutUrl(background(), out.logoutRef)).resolves.toContain('id_token_hint=');
    // Хоёр дахь удаад ref устсан тул хоосон.
    await expect(uc.logoutUrl(background(), out.logoutRef)).resolves.toBe('');
  });

  it('ref хоосон бол хоосон мөр (алдаа БИШ)', async () => {
    const { uc } = build();
    await expect(uc.logoutUrl(background(), '  ')).resolves.toBe('');
  });
});
