// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Super admin бүртгэлийн шидтэн болон MFA-ийн unit тестүүд. Гол баталгаанууд:
//   • урилгагүй / ашигласан урилга / баталгаажаагүй Google и-мэйл → 403;
//   • алхам АЛГАСАХ боломжгүй (eID-гүйгээр TOTP тохируулах гэх мэт);
//   • eID алхамд session ОЛГОГДОХГҮЙ, хэрэглэгч ҮҮСЭХГҮЙ;
//   • TOTP secret нь DB-д ЗӨВХӨН шифрлэгдсэн байдлаар очно;
//   • нөөц код НЭГ УДААГИЙН; MFA-д оролдлогын хязгаар токеныг цуцална.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type { RedisCache } from '../../datasources/caches/redis.js';
import type {
  RecoveryCodeRepository,
  SuperadminInviteRepository,
} from '../../datasources/repositories/interface/superadmin.js';
import type {
  SuperadminAccountRepository,
  UserRepository,
} from '../../datasources/repositories/interface/users.js';
import type { SuperadminAccount, SuperadminInvite } from '../../domain/superadmin_account.js';
import { emptyUser, RoleSuperAdmin, RoleUser } from '../../domain/users.js';
import type { User } from '../../domain/users.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { newCipher } from '../../pkg/crypto/cipher.js';
import type { EidClient } from '../../pkg/eid/eid.js';
import type { GoogleClient } from '../../pkg/google/google.js';
import type { JWTService } from '../../pkg/jwt/jwt.js';
import { hashRecoveryCode } from '../../pkg/recovery/recovery.js';
import { generateTotp } from '../../pkg/totp/totp.js';
import { ErrNotApproved } from '../../pkg/verify/verify.js';
import type { VerifySender } from '../../pkg/verify/verify.js';
import { superadminMFAKey } from '../auth/redis_keys.js';
import { newOnboardingUsecase, StepEID, StepEmail, StepTOTP } from './onboarding_usecase.js';

const ctx: Ctx = background();
const encKey = 'test-encryption-key-for-superadmin-onboarding';

const invite = (over: Partial<SuperadminInvite> = {}): SuperadminInvite => ({
  email: 'boss@dgov.mn',
  invitedBy: 'root@dgov.mn',
  createdAt: new Date(),
  acceptedAt: null,
  ...over,
});

/** memoryRedis нь Redis-ийн шаардлагатай гадаргууг санах ойд хуулбарлана. */
function memoryRedis(): RedisCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: (_c: Ctx, k: string, v: unknown) => {
      store.set(k, String(v));
      return Promise.resolve();
    },
    setTTL: (_c: Ctx, k: string, v: unknown) => {
      store.set(k, String(v));
      return Promise.resolve();
    },
    get: (_c: Ctx, k: string) => {
      const v = store.get(k);
      return v === undefined ? Promise.reject(new Error('cache miss')) : Promise.resolve(v);
    },
    getDel: (_c: Ctx, k: string) => {
      const v = store.get(k);
      store.delete(k);
      return v === undefined ? Promise.reject(new Error('cache miss')) : Promise.resolve(v);
    },
    del: (_c: Ctx, k: string) => {
      store.delete(k);
      return Promise.resolve();
    },
    incr: (_c: Ctx, k: string) => {
      const n = Number.parseInt(store.get(k) ?? '0', 10) + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    },
    expire: () => Promise.resolve(),
  } as unknown as RedisCache & { store: Map<string, string> };
}

const googleUser = {
  sub: 'g-1',
  email: 'boss@dgov.mn',
  emailVerified: true,
  name: 'Бат',
  picture: 'https://pic',
};

const fakeGoogle = (over: Partial<GoogleClient> = {}): GoogleClient =>
  ({
    configured: () => true,
    exchange: () => Promise.resolve(googleUser),
    ...over,
  }) as unknown as GoogleClient;

const fakeEid = (over: Record<string, unknown> = {}): EidClient =>
  ({
    qrInitiate: () =>
      Promise.resolve({
        sessionId: 's-1',
        deviceLinkUrl: 'https://link',
        verificationCode: '1234',
        expiresAt: '',
      }),
    initiate: () =>
      Promise.resolve({
        sessionId: 's-1',
        deviceLinkUrl: '',
        verificationCode: '1234',
        expiresAt: '',
      }),
    session: () =>
      Promise.resolve({
        state: 'COMPLETE',
        identity: {
          civilId: 'УБ12345678',
          nationalId: 'УБ12345678',
          givenName: 'Бат',
          surname: 'Дорж',
          givenNameEn: 'Bat',
          surnameEn: 'Dorj',
          kycLevel: 'high',
        },
      }),
    ...over,
  }) as unknown as EidClient;

const fakeVerify = (over: Partial<VerifySender> = {}): VerifySender => ({
  send: () => Promise.resolve('req-1'),
  check: () => Promise.resolve(),
  ...over,
});

const storedUser: User = {
  ...emptyUser(),
  id: 'u-1',
  username: 'sa_уб12345678',
  email: 'boss@dgov.mn',
  roleId: RoleSuperAdmin,
  active: true,
  createdAt: new Date(),
};

function fakeUsers(over: Record<string, unknown> = {}): UserRepository {
  return {
    upsertSuperAdmin: () => Promise.resolve(storedUser),
    getById: () => Promise.resolve(storedUser),
    ...over,
  } as unknown as UserRepository;
}

const fakeAccounts = (account?: Partial<SuperadminAccount>): SuperadminAccountRepository =>
  ({
    get: (): Promise<SuperadminAccount> =>
      account
        ? Promise.resolve({
            userId: 'u-1',
            civilId: 'x',
            nationalId: 'x',
            emailVerified: true,
            mfaEnabled: true,
            totpSecret: '',
            invitedBy: '',
            onboardedAt: null,
            createdAt: new Date(),
            updatedAt: null,
            ...account,
          })
        : Promise.reject(notFound('superadmin account not found')),
  }) satisfies SuperadminAccountRepository;

function fakeInvites(over: Partial<SuperadminInviteRepository> = {}): SuperadminInviteRepository {
  return {
    list: () => Promise.resolve([]),
    getByEmail: () => Promise.resolve(invite()),
    create: () => Promise.resolve(invite()),
    deleteInvite: () => Promise.resolve(),
    markAccepted: () => Promise.resolve(),
    ...over,
  };
}

function fakeRecovery(over: Partial<RecoveryCodeRepository> = {}): RecoveryCodeRepository {
  return {
    replace: () => Promise.resolve(),
    listActive: () => Promise.resolve([]),
    consume: () => Promise.reject(notFound('recovery code not found')),
    ...over,
  };
}

const fakeJwt: JWTService = {
  generateTokenPair: () => ({
    access_token: 'access',
    refresh_token: 'refresh',
    refreshJTI: 'jti-1',
    refresh_expires_at: new Date(Date.now() + 3_600_000),
  }),
} as unknown as JWTService;

const cfg = {
  issuer: 'Test Platform',
  pendingTTLSeconds: 1800,
  otpTTLSeconds: 600,
  otpMaxAttempts: 5,
  mfaMaxAttempts: 3,
  eidDisplayText: 'dgov.mn',
  recoveryCodeCount: 10,
};

function build(
  parts: {
    google?: GoogleClient;
    eid?: EidClient;
    verify?: VerifySender;
    users?: UserRepository;
    recovery?: RecoveryCodeRepository;
    accounts?: SuperadminAccountRepository;
    invites?: SuperadminInviteRepository;
    redis?: ReturnType<typeof memoryRedis>;
  } = {},
) {
  const redis = parts.redis ?? memoryRedis();
  const uc = newOnboardingUsecase(
    parts.google ?? fakeGoogle(),
    parts.eid ?? fakeEid(),
    parts.verify ?? fakeVerify(),
    parts.users ?? fakeUsers(),
    parts.recovery ?? fakeRecovery(),
    parts.accounts ?? fakeAccounts({ mfaEnabled: true }),
    parts.invites ?? fakeInvites(),
    fakeJwt,
    redis,
    encKey,
    cfg,
  );
  return { uc, redis };
}

describe('1. Google алхам (урилгын хаалга)', () => {
  it('урилгатай и-мэйл нь onboard_token үүсгэнэ', async () => {
    const { uc } = build();
    const out = await uc.google(ctx, 'code', 'https://app/cb');
    expect(out.onboardToken).toHaveLength(32);
    expect(out.step).toBe(StepEID);
    expect(out.email).toBe('boss@dgov.mn');
  });

  it('урилгагүй и-мэйл нь 403', async () => {
    const { uc } = build({
      invites: fakeInvites({ getByEmail: () => Promise.reject(notFound('nope')) }),
    });
    await expect(uc.google(ctx, 'code', '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('ашигласан урилга нь 403', async () => {
    const { uc } = build({
      invites: fakeInvites({
        getByEmail: () => Promise.resolve(invite({ acceptedAt: new Date() })),
      }),
    });
    await expect(uc.google(ctx, 'code', '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('баталгаажаагүй Google и-мэйлээр allow-list-ыг ТОЙРОХ боломжгүй', async () => {
    const { uc } = build({
      google: fakeGoogle({
        exchange: () => Promise.resolve({ ...googleUser, emailVerified: false }),
      }),
    });
    await expect(uc.google(ctx, 'code', '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('и-мэйлийг Google-ийнхээс БИШ, урилгын мөрөөс авна', async () => {
    const { uc, redis } = build({
      google: fakeGoogle({
        exchange: () => Promise.resolve({ ...googleUser, email: 'other@evil.mn' }),
      }),
      invites: fakeInvites({
        getByEmail: () => Promise.resolve(invite({ email: 'boss@dgov.mn' })),
      }),
    });
    const out = await uc.google(ctx, 'code', '');
    const sess = JSON.parse(redis.store.get(`superadmin_onboard:${out.onboardToken}`) ?? '{}') as {
      email: string;
    };
    expect(sess.email).toBe('boss@dgov.mn');
  });
});

describe('алхам алгасах хаалт', () => {
  it('хүчингүй onboard_token нь 403', async () => {
    const { uc } = build();
    await expect(uc.totpInit(ctx, 'no-such-token')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('eID хийхээс өмнө TOTP тохируулах боломжгүй', async () => {
    const { uc } = build();
    const { onboardToken } = await uc.google(ctx, 'code', '');
    await expect(uc.totpInit(ctx, onboardToken)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('и-мэйл баталгаажуулахаас өмнө TOTP боломжгүй', async () => {
    const { uc } = build();
    const { onboardToken } = await uc.google(ctx, 'code', '');
    await uc.eidPoll(ctx, onboardToken, 's-1');
    await expect(uc.totpInit(ctx, onboardToken)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });
});

describe('2. eID алхам', () => {
  it('COMPLETE үед session ОЛГОХГҮЙ, зөвхөн алхам ахина', async () => {
    const upsert = vi.fn(() => Promise.resolve(storedUser));
    const { uc } = build({ users: fakeUsers({ upsertSuperAdmin: upsert }) });
    const { onboardToken } = await uc.google(ctx, 'code', '');
    const out = await uc.eidPoll(ctx, onboardToken, 's-1');
    expect(out).toEqual({ state: 'COMPLETE', step: StepEmail });
    // Хэрэглэгч ЭНЭ алхамд үүсэхгүй.
    expect(upsert).not.toHaveBeenCalled();
  });

  it('RUNNING үед алхам хэвээр', async () => {
    const { uc } = build({
      eid: fakeEid({ session: () => Promise.resolve({ state: 'RUNNING', identity: null }) }),
    });
    const { onboardToken } = await uc.google(ctx, 'code', '');
    expect(await uc.eidPoll(ctx, onboardToken, 's-1')).toEqual({ state: 'RUNNING', step: StepEID });
  });

  it('identity-гүй COMPLETE нь 500 (дутуу баталгаа)', async () => {
    const { uc } = build({
      eid: fakeEid({ session: () => Promise.resolve({ state: 'COMPLETE', identity: null }) }),
    });
    const { onboardToken } = await uc.google(ctx, 'code', '');
    await expect(uc.eidPoll(ctx, onboardToken, 's-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Internal),
    );
  });
});

describe('3. И-мэйл OTP алхам', () => {
  const reachEmailStep = async (parts = {}) => {
    const built = build(parts);
    const { onboardToken } = await built.uc.google(ctx, 'code', '');
    await built.uc.eidPoll(ctx, onboardToken, 's-1');
    return { ...built, onboardToken };
  };

  it('OTP-г УРИЛГЫН и-мэйл рүү илгээнэ', async () => {
    const send = vi.fn((_to: string, _ch: string) => Promise.resolve('req-1'));
    const { uc, onboardToken } = await reachEmailStep({ verify: fakeVerify({ send }) });
    await uc.emailSend(ctx, onboardToken);
    expect(send).toHaveBeenCalledWith('boss@dgov.mn', '', undefined);
  });

  it('буруу код нь 400 (дотоод алдаа биш)', async () => {
    const { uc, onboardToken } = await reachEmailStep({
      verify: fakeVerify({ check: () => Promise.reject(new ErrNotApproved()) }),
    });
    await uc.emailSend(ctx, onboardToken);
    await expect(uc.emailVerify(ctx, onboardToken, '000000')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('OTP илгээгээгүй бол шалгах боломжгүй', async () => {
    const { uc, onboardToken } = await reachEmailStep();
    await expect(uc.emailVerify(ctx, onboardToken, '123456')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('амжилттай OTP нь TOTP алхам руу ахиулна', async () => {
    const { uc, onboardToken } = await reachEmailStep();
    await uc.emailSend(ctx, onboardToken);
    expect(await uc.emailVerify(ctx, onboardToken, '123456')).toEqual({ step: StepTOTP });
  });

  it('оролдлого хэтэрвэл кодыг цуцална (403)', async () => {
    const { uc, onboardToken } = await reachEmailStep({
      verify: fakeVerify({ check: () => Promise.reject(new ErrNotApproved()) }),
    });
    await uc.emailSend(ctx, onboardToken);
    for (let i = 0; i < cfg.otpMaxAttempts; i++) {
      await uc.emailVerify(ctx, onboardToken, '000000').catch(() => undefined);
    }
    await expect(uc.emailVerify(ctx, onboardToken, '000000')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });
});

describe('4. TOTP + finalize', () => {
  const reachTotpStep = async (parts = {}) => {
    const built = build(parts);
    const { onboardToken } = await built.uc.google(ctx, 'code', '');
    await built.uc.eidPoll(ctx, onboardToken, 's-1');
    await built.uc.emailSend(ctx, onboardToken);
    await built.uc.emailVerify(ctx, onboardToken, '123456');
    return { ...built, onboardToken };
  };

  it('totpInit нь secret + otpauth URI өгнө; дахин дуудвал ШИНЭ secret', async () => {
    const { uc, onboardToken } = await reachTotpStep();
    const first = await uc.totpInit(ctx, onboardToken);
    expect(first.otpauthUrl).toContain('otpauth://totp/');
    expect(first.otpauthUrl).toContain('Test%20Platform');
    const second = await uc.totpInit(ctx, onboardToken);
    expect(second.secret).not.toBe(first.secret);
  });

  it('буруу TOTP код нь 400 — хэрэглэгч ҮҮСЭХГҮЙ', async () => {
    const upsert = vi.fn(() => Promise.resolve(storedUser));
    const { uc, onboardToken } = await reachTotpStep({
      users: fakeUsers({ upsertSuperAdmin: upsert }),
    });
    await uc.totpInit(ctx, onboardToken);
    await expect(uc.totpVerify(ctx, onboardToken, '000000')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('totpInit хийлгүй verify хийвэл 400', async () => {
    const { uc, onboardToken } = await reachTotpStep();
    await expect(uc.totpVerify(ctx, onboardToken, '123456')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('зөв кодоор төгсөж, TOTP secret ШИФРЛЭГДСЭН байдлаар хадгалагдана', async () => {
    let savedAccount: SuperadminAccount | null = null;
    const replace = vi.fn((_c: Ctx, _u: string, _h: string[]) => Promise.resolve());
    const markAccepted = vi.fn(() => Promise.resolve());
    const { uc, onboardToken, redis } = await reachTotpStep({
      users: fakeUsers({
        upsertSuperAdmin: (_c: Ctx, _u: User, acct: SuperadminAccount) => {
          savedAccount = acct;
          return Promise.resolve(storedUser);
        },
      }),
      recovery: fakeRecovery({ replace }),
      invites: fakeInvites({ markAccepted }),
    });

    const { secret } = await uc.totpInit(ctx, onboardToken);
    const { authenticator } = await import('otplib');
    const out = await uc.totpVerify(ctx, onboardToken, authenticator.generate(secret));

    expect(out.step).toBe('done');
    expect(out.accessToken).toBe('access');
    expect(out.recoveryCodes).toHaveLength(10);
    // Нөөц код нь ЗӨВХӨН hash-аар хадгалагдана.
    const hashes = (replace.mock.calls[0] as unknown as [Ctx, string, string[]])[2];
    expect(hashes).toHaveLength(10);
    expect(hashes).not.toContain(out.recoveryCodes[0]);
    expect(hashes[0]).toBe(hashRecoveryCode(out.recoveryCodes[0] ?? ''));
    // TOTP secret нь DB-д ил текстээр ОЧИХГҮЙ.
    const acct = savedAccount as unknown as SuperadminAccount;
    expect(acct.totpSecret).not.toBe(secret);
    expect(newCipher(encKey).decrypt(acct.totpSecret)).toBe(secret);
    expect(acct.mfaEnabled).toBe(true);
    // Урилга ашигласан гэж тэмдэглэгдэнэ; ил текст secret агуулсан session устна.
    expect(markAccepted).toHaveBeenCalledOnce();
    expect(redis.store.has(`superadmin_onboard:${onboardToken}`)).toBe(false);
  });
});

describe('MFA нэвтрэлтийн 2 дахь шат', () => {
  const seedToken = (redis: ReturnType<typeof memoryRedis>, token = 'mfa-1'): string => {
    redis.store.set(superadminMFAKey(token), 'u-1');
    return token;
  };

  it('хүчингүй/хугацаа дууссан токен нь 403 (fail-closed)', async () => {
    const { uc } = build();
    await expect(uc.superadminMfa(ctx, 'no-such', '123456')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('зөв TOTP кодоор session олгоно', async () => {
    const redis = memoryRedis();
    const { secret } = generateTotp('Test Platform', 'boss@dgov.mn');
    const { uc } = build({
      redis,
      accounts: fakeAccounts({ mfaEnabled: true, totpSecret: newCipher(encKey).encrypt(secret) }),
    });
    const token = seedToken(redis);
    const { authenticator } = await import('otplib');
    const out = await uc.superadminMfa(ctx, token, authenticator.generate(secret));
    expect(out.accessToken).toBe('access');
    expect(out.usedRecoveryCode).toBe(false);
    // Токен НЭГ УДААГИЙН — амжилтын дараа устана.
    expect(redis.store.has(superadminMFAKey(token))).toBe(false);
  });

  it('нөөц кодоор нэвтэрвэл үлдсэн тоог мэдэгдэнэ', async () => {
    const redis = memoryRedis();
    const consume = vi.fn((_c: Ctx, _u: string, _h: string) => Promise.resolve());
    const { uc } = build({
      redis,
      recovery: fakeRecovery({
        consume,
        listActive: () =>
          Promise.resolve([
            { id: '1', userId: 'u-1', codeHash: 'h', usedAt: null, createdAt: new Date() },
          ]),
      }),
    });
    const out = await uc.superadminMfa(ctx, seedToken(redis), 'ABCD-EFGH');
    expect(out.usedRecoveryCode).toBe(true);
    expect(out.recoveryCodesLeft).toBe(1);
    expect(consume).toHaveBeenCalledWith(expect.anything(), 'u-1', hashRecoveryCode('ABCD-EFGH'));
  });

  it('MFA идэвхгүй / account байхгүй бол 403 (fail-closed)', async () => {
    const redis = memoryRedis();
    const { uc } = build({ redis, accounts: fakeAccounts() });
    await expect(uc.superadminMfa(ctx, seedToken(redis), '123456')).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Forbidden),
    );
  });

  it('super admin биш хэрэглэгч нь 403', async () => {
    const redis = memoryRedis();
    const { uc } = build({
      redis,
      users: fakeUsers({ getById: () => Promise.resolve({ ...storedUser, roleId: RoleUser }) }),
    });
    await expect(uc.superadminMfa(ctx, seedToken(redis), '123456')).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Forbidden),
    );
  });

  it('оролдлого хэтэрвэл токен ЦУЦЛАГДАНА', async () => {
    const redis = memoryRedis();
    const { uc } = build({ redis });
    const token = seedToken(redis);
    for (let i = 0; i < cfg.mfaMaxAttempts; i++) {
      await uc.superadminMfa(ctx, token, '000000').catch(() => undefined);
    }
    await expect(uc.superadminMfa(ctx, token, '000000')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
    expect(redis.store.has(superadminMFAKey(token))).toBe(false);
  });

  it('код хоосон бол 400', async () => {
    const { uc } = build();
    await expect(uc.superadminMfa(ctx, 'tok', '')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });
});
