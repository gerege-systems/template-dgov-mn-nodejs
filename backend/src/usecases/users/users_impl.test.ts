// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// users usecase-ийн unit тестүүд — repository нь mock, DB шаардахгүй. Гол
// зорилго нь эрх нэмэгдүүлэх (privilege-escalation) хамгаалалт, кэшийн зан төлөв
// болон алдааны буулгалт (DomainError хадгалагдах эсэх)-ийг барих.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType, conflict, is, notFound } from '../../apperror/index.js';
import { newMemoryCache, type MemoryCache } from '../../datasources/caches/memory.js';
import type { UserRepository } from '../../datasources/repositories/interface/users.js';
import {
  emptyUser,
  RoleAdmin,
  RoleManager,
  RoleSuperAdmin,
  RoleUser,
  type User,
} from '../../domain/users.js';
import { background, type Ctx } from '../../pkg/ctx/ctx.js';
import { newUsersUsecase } from './users_impl.js';
import type { UsersUsecase } from './users_usecase.js';

/** stubUser нь тестийн хэрэглэгч бүтээнэ. */
function stubUser(over: Partial<User> = {}): User {
  return {
    ...emptyUser(),
    id: 'user-1',
    username: 'batbayar',
    email: 'bat@dgov.mn',
    roleId: RoleUser,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

/** mockRepo нь UserRepository-ийн бүх method-ыг vi.fn()-ээр хангана. */
function mockRepo(over: Partial<UserRepository> = {}): UserRepository {
  const notImplemented = () => Promise.reject(new Error('not stubbed'));
  return {
    store: vi.fn(notImplemented),
    getByEmail: vi.fn(notImplemented),
    getById: vi.fn(notImplemented),
    getByGoogleSub: vi.fn(notImplemented),
    linkGoogleAccount: vi.fn(notImplemented),
    unlinkGoogle: vi.fn(notImplemented),
    getByNationalId: vi.fn(notImplemented),
    upsertFromEID: vi.fn(notImplemented),
    createPreRegistered: vi.fn(notImplemented),
    list: vi.fn(notImplemented),
    listAdmins: vi.fn(notImplemented),
    changeActiveUser: vi.fn(notImplemented),
    updatePassword: vi.fn(notImplemented),
    softDelete: vi.fn(notImplemented),
    updateRole: vi.fn(notImplemented),
    getSignature: vi.fn(notImplemented),
    setSignature: vi.fn(notImplemented),
    setLatinName: vi.fn(notImplemented),
    upsertSuperAdmin: vi.fn(notImplemented),
    ...over,
  };
}

let cache: MemoryCache;
let ctx: Ctx;

function build(repo: UserRepository): UsersUsecase {
  // bcrypt cost-ыг тестүүдэд хамгийн бага (4) болгоно — хугацаа хэмнэнэ.
  return newUsersUsecase(repo, cache, { bcryptCost: 4 });
}

beforeEach(() => {
  cache = newMemoryCache();
  ctx = background();
});

describe('store', () => {
  it('нууц үгийг hash хийж, и-мэйлийг нормчилж хадгална', async () => {
    const repo = mockRepo({
      store: vi.fn((_c, u: User) => Promise.resolve({ ...u, id: 'new-id' })),
    });
    const uc = build(repo);
    const res = await uc.store(ctx, {
      user: stubUser({ id: '', email: ' Bat@DGOV.mn ', password: 'Str0ng!Pass' }),
    });
    expect(res.user.id).toBe('new-id');
    expect(res.user.email).toBe('bat@dgov.mn');
    expect(res.user.password).not.toBe('Str0ng!Pass');
    expect(res.user.password.startsWith('$2')).toBe(true);
  });

  it('domain-ийн баталгаажуулалтын алдааг 400 болгоно', async () => {
    const uc = build(mockRepo());
    await expect(
      uc.store(ctx, { user: stubUser({ email: 'not-an-email', password: 'x' }) }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('repository-ийн conflict-ыг ХАДГАЛНА (500 болгохгүй)', async () => {
    const repo = mockRepo({
      store: vi.fn(() => Promise.reject(conflict('username or email already exists'))),
    });
    await expect(
      build(repo).store(ctx, { user: stubUser({ password: 'Str0ng!Pass' }) }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Conflict));
  });
});

describe('getByEmail', () => {
  it('кэш алдалт дээр DB-ээс уншиж, дараа нь кэшээс үйлчилнэ', async () => {
    const getByEmail = vi.fn(() => Promise.resolve(stubUser()));
    const uc = build(mockRepo({ getByEmail }));

    const first = await uc.getByEmail(ctx, { email: 'bat@dgov.mn' });
    const second = await uc.getByEmail(ctx, { email: 'BAT@dgov.MN ' });

    expect(first.user.id).toBe('user-1');
    expect(second.user.id).toBe('user-1');
    // Хоёр дахь дуудалт кэшээс — DB руу зөвхөн НЭГ query.
    expect(getByEmail).toHaveBeenCalledTimes(1);
  });

  it('зэрэгцээ алдалтуудыг НЭГ DB дуудлагад нэгтгэнэ (single-flight)', async () => {
    let resolveDb: ((u: User) => void) | undefined;
    const getByEmail = vi.fn(
      () =>
        new Promise<User>((resolve) => {
          resolveDb = resolve;
        }),
    );
    const uc = build(mockRepo({ getByEmail }));

    const a = uc.getByEmail(ctx, { email: 'bat@dgov.mn' });
    const b = uc.getByEmail(ctx, { email: 'bat@dgov.mn' });
    resolveDb?.(stubUser());
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.user.id).toBe('user-1');
    expect(rb.user.id).toBe('user-1');
    expect(getByEmail).toHaveBeenCalledTimes(1);
  });

  it('notFound-ыг ХАДГАЛНА (дэд бүтцийн 500 болгохгүй)', async () => {
    const repo = mockRepo({ getByEmail: vi.fn(() => Promise.reject(notFound('user not found'))) });
    await expect(build(repo).getByEmail(ctx, { email: 'nobody@dgov.mn' })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.NotFound),
    );
  });

  it('түүхий алдааг дотоод алдаа болгож боож, дэлгэрэнгүйг нуна', async () => {
    const repo = mockRepo({
      getByEmail: vi.fn(() => Promise.reject(new Error('pq: connection refused to 10.0.0.5'))),
    });
    await expect(build(repo).getByEmail(ctx, { email: 'bat@dgov.mn' })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Internal) && (e as Error).message === 'internal server error',
    );
  });
});

describe('updateRole — эрх нэмэгдүүлэхээс хамгаалах', () => {
  it('super admin эрхийг ХЭЗЭЭ Ч оноож болохгүй', async () => {
    const uc = build(mockRepo());
    await expect(
      uc.updateRole(ctx, { userId: 'u', roleId: RoleSuperAdmin, callerRoleId: RoleSuperAdmin }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Forbidden));
  });

  it('super admin бүртгэлийг өөрчилж болохгүй', async () => {
    const repo = mockRepo({
      getById: vi.fn(() => Promise.resolve(stubUser({ roleId: RoleSuperAdmin }))),
    });
    await expect(
      build(repo).updateRole(ctx, {
        userId: 'u',
        roleId: RoleUser,
        callerRoleId: RoleSuperAdmin,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Forbidden));
  });

  it('энгийн admin нь ADMIN эрх олгож чадахгүй', async () => {
    const repo = mockRepo({ getById: vi.fn(() => Promise.resolve(stubUser())) });
    await expect(
      build(repo).updateRole(ctx, { userId: 'u', roleId: RoleAdmin, callerRoleId: RoleAdmin }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Forbidden));
  });

  it('энгийн admin нь admin бүртгэлийг өөрчилж чадахгүй', async () => {
    const repo = mockRepo({
      getById: vi.fn(() => Promise.resolve(stubUser({ roleId: RoleAdmin }))),
    });
    await expect(
      build(repo).updateRole(ctx, { userId: 'u', roleId: RoleUser, callerRoleId: RoleAdmin }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Forbidden));
  });

  it('энгийн admin нь manager ↔ user хооронд сольж чадна', async () => {
    const updateRole = vi.fn(() => Promise.resolve());
    const repo = mockRepo({ getById: vi.fn(() => Promise.resolve(stubUser())), updateRole });
    await build(repo).updateRole(ctx, {
      userId: 'user-1',
      roleId: RoleManager,
      callerRoleId: RoleAdmin,
    });
    expect(updateRole).toHaveBeenCalledWith(ctx, 'user-1', RoleManager);
  });

  it('super admin нь ADMIN эрх олгож чадна', async () => {
    const updateRole = vi.fn(() => Promise.resolve());
    const repo = mockRepo({ getById: vi.fn(() => Promise.resolve(stubUser())), updateRole });
    await build(repo).updateRole(ctx, {
      userId: 'user-1',
      roleId: RoleAdmin,
      callerRoleId: RoleSuperAdmin,
    });
    expect(updateRole).toHaveBeenCalledWith(ctx, 'user-1', RoleAdmin);
  });

  it('role сольсны дараа кэшийг хүчингүй болгоно', async () => {
    const user = stubUser();
    const repo = mockRepo({
      getById: vi.fn(() => Promise.resolve(user)),
      updateRole: vi.fn(() => Promise.resolve()),
    });
    cache.set('user/bat@dgov.mn', user);
    await build(repo).updateRole(ctx, {
      userId: 'user-1',
      roleId: RoleManager,
      callerRoleId: RoleSuperAdmin,
    });
    expect(cache.get('user/bat@dgov.mn')).toBeUndefined();
  });
});

describe('setActive / deleteUser — super admin хамгаалалт', () => {
  it('setActive нь super admin-г идэвхгүй болгож чадахгүй', async () => {
    const repo = mockRepo({
      getById: vi.fn(() => Promise.resolve(stubUser({ roleId: RoleSuperAdmin }))),
    });
    await expect(build(repo).setActive(ctx, { userId: 'u', active: false })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Forbidden),
    );
  });

  it('deleteUser нь super admin-г устгаж чадахгүй', async () => {
    const repo = mockRepo({
      getById: vi.fn(() => Promise.resolve(stubUser({ roleId: RoleSuperAdmin }))),
    });
    await expect(build(repo).deleteUser(ctx, { userId: 'u' })).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('устгасны дараа кэшийг хүчингүй болгоно', async () => {
    const user = stubUser();
    const repo = mockRepo({
      getById: vi.fn(() => Promise.resolve(user)),
      softDelete: vi.fn(() => Promise.resolve()),
    });
    cache.set('user/bat@dgov.mn', user);
    await build(repo).deleteUser(ctx, { userId: 'user-1' });
    expect(cache.get('user/bat@dgov.mn')).toBeUndefined();
  });
});

describe('createPreRegistered', () => {
  it('регистрийн дугаарыг жижиг үсэг болгож, username-г үүсгэнэ', async () => {
    const createPreRegistered = vi.fn((_c, u: User) => Promise.resolve({ ...u, id: 'new' }));
    const uc = build(mockRepo({ createPreRegistered }));
    const out = await uc.createPreRegistered(ctx, {
      register: '  AB12345678 ',
      firstName: ' Бат ',
      lastName: 'Дорж',
      firstNameEn: '',
      lastNameEn: '',
      roleId: RoleUser,
      callerRoleId: RoleAdmin,
    });
    expect(out.id).toBe('new');
    const passed = createPreRegistered.mock.calls[0]?.[1] as User;
    expect(passed.nationalId).toBe('ab12345678');
    expect(passed.username).toBe('reg_ab12345678');
    expect(passed.firstName).toBe('Бат');
    expect(passed.active).toBe(true);
  });

  it('хоосон регистрийн дугаарыг татгалзана', async () => {
    await expect(
      build(mockRepo()).createPreRegistered(ctx, {
        register: '   ',
        firstName: 'Бат',
        lastName: 'Дорж',
        firstNameEn: '',
        lastNameEn: '',
        roleId: RoleUser,
        callerRoleId: RoleAdmin,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('role оноогоогүй бол хамгийн бага эрх (user) авна', async () => {
    const createPreRegistered = vi.fn((_c, u: User) => Promise.resolve({ ...u, id: 'new' }));
    await build(mockRepo({ createPreRegistered })).createPreRegistered(ctx, {
      register: 'ab1',
      firstName: 'Бат',
      lastName: 'Дорж',
      firstNameEn: '',
      lastNameEn: '',
      roleId: 0,
      callerRoleId: RoleAdmin,
    });
    expect((createPreRegistered.mock.calls[0]?.[1] as User).roleId).toBe(RoleUser);
  });

  it('энгийн admin нь ADMIN эрхтэй бүртгэл үүсгэж чадахгүй', async () => {
    await expect(
      build(mockRepo()).createPreRegistered(ctx, {
        register: 'ab1',
        firstName: 'Бат',
        lastName: 'Дорж',
        firstNameEn: '',
        lastNameEn: '',
        roleId: RoleAdmin,
        callerRoleId: RoleAdmin,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Forbidden));
  });
});

describe('activate', () => {
  it('active=true тавьж, кэшийг хүчингүй болгоно', async () => {
    const changeActiveUser = vi.fn(() => Promise.resolve());
    const repo = mockRepo({
      changeActiveUser,
      getById: vi.fn(() => Promise.resolve(stubUser())),
    });
    cache.set('user/bat@dgov.mn', stubUser({ active: false }));
    await build(repo).activate(ctx, { userId: 'user-1' });
    expect(changeActiveUser).toHaveBeenCalledWith(ctx, 'user-1', true);
    expect(cache.get('user/bat@dgov.mn')).toBeUndefined();
  });

  it('кэш цэвэрлэх уншилт нурсан ч гол үйлдэл амжилттай хэвээр', async () => {
    const repo = mockRepo({
      changeActiveUser: vi.fn(() => Promise.resolve()),
      getById: vi.fn(() => Promise.reject(new Error('db down'))),
    });
    await expect(build(repo).activate(ctx, { userId: 'user-1' })).resolves.toBeUndefined();
  });
});

describe('updatePassword', () => {
  it('user id дутуу бол 400', async () => {
    await expect(
      build(mockRepo()).updatePassword(ctx, { user: stubUser({ id: '' }) }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('шинэчилсний дараа кэшийг хүчингүй болгоно', async () => {
    const repo = mockRepo({ updatePassword: vi.fn(() => Promise.resolve()) });
    cache.set('user/bat@dgov.mn', stubUser());
    await build(repo).updatePassword(ctx, { user: stubUser() });
    expect(cache.get('user/bat@dgov.mn')).toBeUndefined();
  });
});

describe('list', () => {
  it('filter-ийг repository руу дамжуулна', async () => {
    const list = vi.fn(() => Promise.resolve([stubUser()]));
    const uc = build(mockRepo({ list }));
    const res = await uc.list(ctx, { roleId: RoleAdmin, activeOnly: true, offset: 10, limit: 20 });
    expect(res.users).toHaveLength(1);
    expect(list).toHaveBeenCalledWith(
      ctx,
      { roleId: RoleAdmin, activeOnly: true, includeDeleted: false },
      10,
      20,
    );
  });
});
