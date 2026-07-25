// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// auth usecase-ийн unit тестүүд — eID/Google client, Redis, users usecase бүгд
// mock. Гол зорилго нь АЮУЛГҮЙ БАЙДЛЫН зан төлөв: refresh нь нэг л удаа
// хэрэглэгддэг (атом GetDel), хүчингүй болсон/идэвхгүй бүртгэл шинэ токен
// авахгүй, credential эргүүлэхээс өмнөх токен татгалзагдана, logout нь access
// токеныг ч deny-list-д нэмнэ, super admin MFA-гүйгээр session авахгүй.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import { CacheMissError, type RedisCache } from '../../datasources/caches/redis.js';
import { emptyUser, RoleSuperAdmin, RoleUser, type User } from '../../domain/users.js';
import { background, type Ctx } from '../../pkg/ctx/ctx.js';
import {
  ErrInitiateRejected,
  StateComplete,
  StateExpired,
  StateRefused,
  StateRunning,
  type EidClient,
  type Identity,
} from '../../pkg/eid/eid.js';
import type { Lookuper } from '../../pkg/xyp/xyp.js';
import type { GoogleClient } from '../../pkg/google/google.js';
import { newJWTServiceWithRefresh, type JWTService } from '../../pkg/jwt/jwt.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { newAuthUsecase } from './auth_impl.js';
import { accessDenyKey, googleLinkKey, refreshKey, superadminMFAKey } from './redis_keys.js';

const secret = 'test-secret-that-is-at-least-32-characters-long';
const issuer = 'test.dgov.mn';

function stubUser(over: Partial<User> = {}): User {
  return {
    ...emptyUser(),
    id: 'user-1',
    username: 'eid_ab1',
    email: '',
    roleId: RoleUser,
    active: true,
    civilId: 'ab1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function stubIdentity(over: Partial<Identity> = {}): Identity {
  return {
    nationalId: 'REG123',
    civilId: 'AB12345678',
    givenName: 'Бат',
    surname: 'Дорж',
    givenNameEn: 'Bat',
    surnameEn: 'Dorj',
    kycLevel: 'ADVANCED',
    documentNumber: 'DEV-1',
    certificate: null,
    ...over,
  };
}

/** fakeRedis нь Map-д тулгуурласан хамгийн бага Redis — GetDel нь атом. */
function fakeRedis(): RedisCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: (_c, k, v) => {
      store.set(k, String(v));
      return Promise.resolve();
    },
    setTTL: (_c, k, v) => {
      store.set(k, String(v));
      return Promise.resolve();
    },
    get: (_c, k) => {
      const v = store.get(k);
      return v === undefined ? Promise.reject(new CacheMissError(k)) : Promise.resolve(v);
    },
    getDel: (_c, k) => {
      const v = store.get(k);
      if (v === undefined) return Promise.reject(new CacheMissError(k));
      store.delete(k);
      return Promise.resolve(v);
    },
    del: (_c, k) => {
      store.delete(k);
      return Promise.resolve();
    },
    incr: () => Promise.resolve(1),
    expire: () => Promise.resolve(),
    pttl: () => Promise.resolve(-1),
    close: () => Promise.resolve(),
    client: () => ({}) as never,
  };
}

function mockUsers(over: Partial<UsersUsecase> = {}): UsersUsecase {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    store: vi.fn(no),
    getByEmail: vi.fn(no),
    getById: vi.fn(no),
    getByNationalId: vi.fn(no),
    getByGoogleSub: vi.fn(no),
    linkGoogleAccount: vi.fn(no),
    unlinkGoogle: vi.fn(no),
    upsertFromEID: vi.fn(no),
    activate: vi.fn(no),
    updatePassword: vi.fn(no),
    list: vi.fn(no),
    listAdmins: vi.fn(no),
    updateRole: vi.fn(no),
    setActive: vi.fn(no),
    deleteUser: vi.fn(no),
    createPreRegistered: vi.fn(no),
    ...over,
  };
}

function mockEid(over: Partial<EidClient> = {}): EidClient {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    qrInitiate: vi.fn(no),
    initiate: vi.fn(no),
    session: vi.fn(no),
    // Байгууллагын төлөөлөл + PKI — auth урсгалд дуудагддаггүй тул stub.
    representations: vi.fn(no),
    addRepresentation: vi.fn(no),
    removeRepresentation: vi.fn(no),
    orgSigners: vi.fn(no),
    addSigner: vi.fn(no),
    removeSigner: vi.fn(no),
    resendSigner: vi.fn(no),
    updateOrgNameLatin: vi.fn(no),
    personSummary: vi.fn(no),
    personCertificates: vi.fn(no),
    personDevices: vi.fn(no),
    personActivity: vi.fn(no),
    ...over,
  };
}

let redis: ReturnType<typeof fakeRedis>;
let jwtService: JWTService;
let ctx: Ctx;

function build(
  users: UsersUsecase,
  eid: EidClient = mockEid(),
  google: GoogleClient | null = null,
  xyp: Lookuper | null = null,
) {
  return newAuthUsecase(users, jwtService, eid, xyp, google, redis, {
    eidDisplayText: 'test.dgov.mn',
  });
}

beforeEach(() => {
  redis = fakeRedis();
  jwtService = newJWTServiceWithRefresh(secret, issuer, 2, 7);
  ctx = background();
});

describe('eidStart', () => {
  it('IdP-ийн session мэдээллийг дамжуулна', async () => {
    const qrInitiate = vi.fn(() =>
      Promise.resolve({
        sessionId: 's1',
        verificationCode: '7270',
        expiresAt: '',
        deviceLinkUrl: 's1',
      }),
    );
    const uc = build(mockUsers(), mockEid({ qrInitiate }));
    const res = await uc.eidStart(ctx, '');
    expect(res.sessionId).toBe('s1');
    expect(res.verificationCode).toBe('7270');
    expect(qrInitiate).toHaveBeenCalledWith('test.dgov.mn', '', undefined);
  });

  it('IdP-ийн 4xx-ийг 400 болгоно (5xx БИШ)', async () => {
    const uc = build(
      mockUsers(),
      mockEid({ qrInitiate: vi.fn(() => Promise.reject(new ErrInitiateRejected('status 400'))) }),
    );
    await expect(uc.eidStart(ctx, '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('сүлжээний алдааг 500 болгож дэлгэрэнгүйг нуна', async () => {
    const uc = build(
      mockUsers(),
      mockEid({ qrInitiate: vi.fn(() => Promise.reject(new Error('dial tcp 10.0.0.5: refused'))) }),
    );
    await expect(uc.eidStart(ctx, '')).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Internal) && (e as Error).message === 'internal server error',
    );
  });
});

describe('eidStartByNationalId', () => {
  it('хоосон РД-г 400-аар татгалзана', async () => {
    await expect(build(mockUsers()).eidStartByNationalId(ctx, '  ', '')).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.BadRequest),
    );
  });

  it('push урсгалд device_link буцаахгүй', async () => {
    const initiate = vi.fn(() =>
      Promise.resolve({
        sessionId: 's2',
        verificationCode: '0489',
        expiresAt: '',
        deviceLinkUrl: 'should-be-dropped',
      }),
    );
    const res = await build(mockUsers(), mockEid({ initiate })).eidStartByNationalId(
      ctx,
      ' REG123 ',
      '',
    );
    expect(res.sessionId).toBe('s2');
    expect(res.deviceLinkUrl).toBe('');
    // РД-г тайрч дамжуулна.
    expect(initiate).toHaveBeenCalledWith('REG123', 'test.dgov.mn', '', undefined);
  });
});

describe('eidPoll', () => {
  it('session_id дутуу бол 400', async () => {
    await expect(
      build(mockUsers()).eidPoll(ctx, { sessionId: '', googleLinkToken: '' }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  for (const state of [StateRunning, StateExpired, StateRefused]) {
    it(`${state} үед зөвхөн төлөв буцаана (хэрэглэгч upsert хийхгүй)`, async () => {
      const upsertFromEID = vi.fn(() => Promise.reject(new Error('should not be called')));
      const uc = build(
        mockUsers({ upsertFromEID }),
        mockEid({ session: vi.fn(() => Promise.resolve({ state, identity: null })) }),
      );
      const res = await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: '' });
      expect(res.state).toBe(state);
      expect(res.user).toBeNull();
      expect(res.accessToken).toBe('');
      expect(upsertFromEID).not.toHaveBeenCalled();
    });
  }

  it('COMPLETE үед хэрэглэгчийг upsert хийж токен хос олгоно', async () => {
    const user = stubUser();
    const upsertFromEID = vi.fn(() => Promise.resolve({ user }));
    const uc = build(
      mockUsers({ upsertFromEID }),
      mockEid({
        session: vi.fn(() => Promise.resolve({ state: StateComplete, identity: stubIdentity() })),
      }),
    );
    const res = await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: '' });

    expect(res.state).toBe(StateComplete);
    expect(res.user?.id).toBe('user-1');
    expect(res.accessToken).not.toBe('');
    expect(res.refreshToken).not.toBe('');
    // refresh jti нь Redis-д бүртгэгдсэн байх ёстой (эс бөгөөс /refresh унана).
    const claims = jwtService.parseRefreshToken(res.refreshToken);
    expect(redis.store.has(refreshKey(claims.jti))).toBe(true);
  });

  it('civil_id-г түлхүүр болгож, cert дэлгэрэнгүйг хэрэглэгчид хадгална', async () => {
    let passed: User | undefined;
    const upsertFromEID = vi.fn((_c, req: { user: User }) => {
      passed = req.user;
      return Promise.resolve({ user: stubUser() });
    });
    const notBefore = new Date('2026-01-01T00:00:00Z');
    const notAfter = new Date('2036-01-01T00:00:00Z');
    const uc = build(
      mockUsers({ upsertFromEID }),
      mockEid({
        session: vi.fn(() =>
          Promise.resolve({
            state: StateComplete,
            identity: stubIdentity({
              certificate: {
                serial: '1a2b',
                notBefore,
                notAfter,
                issuer: 'Test CA',
                keyType: 'ECDSA P-256',
              },
            }),
          }),
        ),
      }),
    );
    await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: '' });

    // Түлхүүр нь civil_id (жижиг үсгээр) — national_id БИШ.
    expect(passed?.civilId).toBe('ab12345678');
    expect(passed?.username).toBe('eid_ab12345678');
    expect(passed?.certSerial).toBe('1a2b');
    expect(passed?.certIssuer).toBe('Test CA');
    expect(passed?.certNotAfter).toBe(notAfter);
    expect(passed?.documentNumber).toBe('DEV-1');
  });

  it('civil_id хоосон бол national_id руу fallback хийнэ', async () => {
    let passed: User | undefined;
    const uc = build(
      mockUsers({
        upsertFromEID: vi.fn((_c, req: { user: User }) => {
          passed = req.user;
          return Promise.resolve({ user: stubUser() });
        }),
      }),
      mockEid({
        session: vi.fn(() =>
          Promise.resolve({
            state: StateComplete,
            identity: stubIdentity({ civilId: '', nationalId: 'REG777' }),
          }),
        ),
      }),
    );
    await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: '' });
    expect(passed?.civilId).toBe('reg777');
  });

  it('COMPLETE боловч identity дутуу бол 500 (чимээгүй нэвтрүүлэхгүй)', async () => {
    const uc = build(
      mockUsers(),
      mockEid({
        session: vi.fn(() =>
          Promise.resolve({
            state: StateComplete,
            identity: stubIdentity({ civilId: '', nationalId: '' }),
          }),
        ),
      }),
    );
    await expect(uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: '' })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Internal),
    );
  });

  it('super admin бол session ОЛГОХГҮЙ — зөвхөн mfa_token', async () => {
    const uc = build(
      mockUsers({
        upsertFromEID: vi.fn(() => Promise.resolve({ user: stubUser({ roleId: RoleSuperAdmin }) })),
      }),
      mockEid({
        session: vi.fn(() => Promise.resolve({ state: StateComplete, identity: stubIdentity() })),
      }),
    );
    const res = await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: '' });
    expect(res.mfaRequired).toBe(true);
    expect(res.mfaToken).not.toBe('');
    expect(res.accessToken).toBe('');
    expect(res.user).toBeNull();
    // mfa токен Redis-д хадгалагдсан (эс бөгөөс баталгаажуулалт боломжгүй).
    expect(redis.store.get(superadminMFAKey(res.mfaToken))).toBe('user-1');
  });

  it('хүлээгдэж буй Google холболтыг eID баталгаажсаны дараа залгана', async () => {
    const linkGoogleAccount = vi.fn(() => Promise.resolve());
    const uc = build(
      mockUsers({
        upsertFromEID: vi.fn(() => Promise.resolve({ user: stubUser() })),
        linkGoogleAccount,
      }),
      mockEid({
        session: vi.fn(() => Promise.resolve({ state: StateComplete, identity: stubIdentity() })),
      }),
    );
    await redis.setTTL(
      ctx,
      googleLinkKey('lt-1'),
      JSON.stringify({ sub: 'g-1', email: 'a@b.c' }),
      60,
    );

    await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: 'lt-1' });

    expect(linkGoogleAccount).toHaveBeenCalledWith(
      ctx,
      'user-1',
      expect.objectContaining({ sub: 'g-1' }),
    );
    // Токен нэг л удаа хэрэглэгдэнэ (GetDel).
    expect(redis.store.has(googleLinkKey('lt-1'))).toBe(false);
  });

  it('Google холбох алдаа нь eID нэвтрэлтийг УНАГААХГҮЙ (non-fatal)', async () => {
    const uc = build(
      mockUsers({
        upsertFromEID: vi.fn(() => Promise.resolve({ user: stubUser() })),
        linkGoogleAccount: vi.fn(() => Promise.reject(new Error('already linked'))),
      }),
      mockEid({
        session: vi.fn(() => Promise.resolve({ state: StateComplete, identity: stubIdentity() })),
      }),
    );
    await redis.setTTL(ctx, googleLinkKey('lt-1'), JSON.stringify({ sub: 'g-1' }), 60);
    const res = await uc.eidPoll(ctx, { sessionId: 's', googleLinkToken: 'lt-1' });
    expect(res.state).toBe(StateComplete);
    expect(res.accessToken).not.toBe('');
  });
});

describe('refresh', () => {
  /** issueSession нь тестэд амьд refresh токен + Redis бичлэг үүсгэнэ. */
  async function issueSession(user: User): Promise<string> {
    const pair = jwtService.generateTokenPair(user.id, false, user.roleId, user.email);
    await redis.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, 3600);
    return pair.refresh_token;
  }

  it('шинэ хос олгож, хуучин jti-г хүчингүй болгоно (эргэлт)', async () => {
    const user = stubUser();
    const token = await issueSession(user);
    const oldJti = jwtService.parseRefreshToken(token).jti;
    const uc = build(mockUsers({ getById: vi.fn(() => Promise.resolve({ user })) }));

    const res = await uc.refresh(ctx, { refreshToken: token });

    expect(res.accessToken).not.toBe('');
    expect(redis.store.has(refreshKey(oldJti))).toBe(false);
    const newJti = jwtService.parseRefreshToken(res.refreshToken).jti;
    expect(redis.store.has(refreshKey(newJti))).toBe(true);
  });

  it('ижил токеныг ХОЁР ДАХЬ удаа хэрэглэвэл татгалзана (replay)', async () => {
    const user = stubUser();
    const token = await issueSession(user);
    const uc = build(mockUsers({ getById: vi.fn(() => Promise.resolve({ user })) }));

    await uc.refresh(ctx, { refreshToken: token });
    await expect(uc.refresh(ctx, { refreshToken: token })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Unauthorized),
    );
  });

  it('зэрэгцээ хоёр хүсэлтээс ЗӨВХӨН НЭГ нь амжина (атом GetDel)', async () => {
    const user = stubUser();
    const token = await issueSession(user);
    const uc = build(mockUsers({ getById: vi.fn(() => Promise.resolve({ user })) }));

    const results = await Promise.allSettled([
      uc.refresh(ctx, { refreshToken: token }),
      uc.refresh(ctx, { refreshToken: token }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('access токеныг refresh мэтээр хэрэглэхийг татгалзана', async () => {
    const access = jwtService.generateToken('user-1', false, RoleUser, '');
    await expect(build(mockUsers()).refresh(ctx, { refreshToken: access })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Unauthorized),
    );
  });

  it('Redis-д байхгүй jti-г татгалзана (logout хийсэн session)', async () => {
    const pair = jwtService.generateTokenPair('user-1', false, RoleUser, '');
    await expect(
      build(mockUsers()).refresh(ctx, { refreshToken: pair.refresh_token }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Unauthorized));
  });

  it('устгагдсан хэрэглэгчид шинэ токен олгохгүй', async () => {
    const token = await issueSession(stubUser());
    const uc = build(
      mockUsers({ getById: vi.fn(() => Promise.reject(notFound('user not found'))) }),
    );
    await expect(uc.refresh(ctx, { refreshToken: token })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Unauthorized),
    );
  });

  it('идэвхгүй бүртгэлийг 403-аар татгалзана', async () => {
    const user = stubUser({ active: false });
    const token = await issueSession(user);
    const uc = build(mockUsers({ getById: vi.fn(() => Promise.resolve({ user })) }));
    await expect(uc.refresh(ctx, { refreshToken: token })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('credential эргүүлэхээс ӨМНӨ олгогдсон токеныг татгалзана', async () => {
    const user = stubUser();
    const token = await issueSession(user);
    // Тасалбарыг токен олгосноос ХОЙШ тавина → токен хүчингүй.
    const rotated = stubUser({ passwordChangedAt: new Date(Date.now() + 60_000) });
    const uc = build(mockUsers({ getById: vi.fn(() => Promise.resolve({ user: rotated })) }));
    await expect(uc.refresh(ctx, { refreshToken: token })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Unauthorized),
    );
  });
});

describe('logout', () => {
  it('refresh jti-г устгана', async () => {
    const pair = jwtService.generateTokenPair('user-1', false, RoleUser, '');
    await redis.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, 3600);

    await build(mockUsers()).logout(ctx, {
      refreshToken: pair.refresh_token,
      accessToken: '',
    });
    expect(redis.store.has(refreshKey(pair.refreshJTI))).toBe(false);
  });

  it('access токен өгвөл түүний jti-г deny-list-д нэмнэ', async () => {
    const pair = jwtService.generateTokenPair('user-1', false, RoleUser, '');
    await redis.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, 3600);

    await build(mockUsers()).logout(ctx, {
      refreshToken: pair.refresh_token,
      accessToken: pair.access_token,
    });
    expect(redis.store.get(accessDenyKey(pair.accessJTI))).toBe('1');
  });

  it('эвдэрсэн access токен logout-ийг УНАГААХГҮЙ (best-effort)', async () => {
    const pair = jwtService.generateTokenPair('user-1', false, RoleUser, '');
    await redis.setTTL(ctx, refreshKey(pair.refreshJTI), pair.refreshJTI, 3600);

    await expect(
      build(mockUsers()).logout(ctx, {
        refreshToken: pair.refresh_token,
        accessToken: 'not-a-jwt',
      }),
    ).resolves.toBeUndefined();
    expect(redis.store.has(refreshKey(pair.refreshJTI))).toBe(false);
  });

  it('буруу refresh токеныг 401-ээр татгалзана', async () => {
    await expect(
      build(mockUsers()).logout(ctx, { refreshToken: 'nope', accessToken: '' }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Unauthorized));
  });
});

describe('googleLogin', () => {
  const googleOk = (sub: string): GoogleClient => ({
    configured: () => true,
    authCodeURL: () => '',
    exchange: vi.fn(() =>
      Promise.resolve({
        sub,
        email: 'g@example.com',
        emailVerified: true,
        name: 'G',
        picture: '',
      }),
    ),
  });

  it('тохируулаагүй бол 500', async () => {
    const uc = build(mockUsers(), mockEid(), {
      configured: () => false,
      authCodeURL: () => '',
      exchange: vi.fn(),
    });
    await expect(uc.googleLogin(ctx, 'code', 'uri')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Internal),
    );
  });

  it('code exchange унавал 400 (дэлгэрэнгүй алдаа гарахгүй)', async () => {
    const uc = build(mockUsers(), mockEid(), {
      configured: () => true,
      authCodeURL: () => '',
      exchange: vi.fn(() => Promise.reject(new Error('invalid_grant from google'))),
    });
    await expect(uc.googleLogin(ctx, 'code', 'uri')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('холбогдсон account бол шууд session олгоно', async () => {
    const user = stubUser({ googleSub: 'g-1' });
    const uc = build(
      mockUsers({
        getByGoogleSub: vi.fn(() => Promise.resolve(user)),
        linkGoogleAccount: vi.fn(() => Promise.resolve()),
      }),
      mockEid(),
      googleOk('g-1'),
    );
    const res = await uc.googleLogin(ctx, 'code', 'uri');
    expect(res.linked).toBe(true);
    expect(res.login?.accessToken).not.toBe('');
  });

  it('холбогдоогүй бол link_token үүсгэж Redis-д профайлыг хадгална', async () => {
    const uc = build(
      mockUsers({ getByGoogleSub: vi.fn(() => Promise.reject(notFound('user not found'))) }),
      mockEid(),
      googleOk('g-new'),
    );
    const res = await uc.googleLogin(ctx, 'code', 'uri');
    expect(res.linked).toBe(false);
    expect(res.linkToken).not.toBe('');
    expect(res.login).toBeNull();
    const stored = redis.store.get(googleLinkKey(res.linkToken));
    expect(stored).toContain('g-new');
  });

  it('DB-ийн ЖИНХЭНЭ алдааг "шинэ хэрэглэгч" гэж ЗӨВШӨӨРӨХГҮЙ', async () => {
    // Дэд бүтцийн доголдол нь эхний-удаа урсгал руу шилжвэл чимээгүй холболт
    // үүсгэх эрсдэлтэй — иймээс алдааг дамжуулах ёстой.
    const uc = build(
      mockUsers({ getByGoogleSub: vi.fn(() => Promise.reject(new Error('db down'))) }),
      mockEid(),
      googleOk('g-1'),
    );
    await expect(uc.googleLogin(ctx, 'code', 'uri')).rejects.toThrow('db down');
  });

  it('super admin бол session олгохгүй — зөвхөн mfa_token', async () => {
    const user = stubUser({ googleSub: 'g-1', roleId: RoleSuperAdmin, email: 'sa@dgov.mn' });
    const uc = build(
      mockUsers({
        getByGoogleSub: vi.fn(() => Promise.resolve(user)),
        linkGoogleAccount: vi.fn(() => Promise.resolve()),
      }),
      mockEid(),
      googleOk('g-1'),
    );
    const res = await uc.googleLogin(ctx, 'code', 'uri');
    expect(res.mfaRequired).toBe(true);
    expect(res.login).toBeNull();
    expect(redis.store.get(superadminMFAKey(res.mfaToken))).toBe('user-1');
  });
});
