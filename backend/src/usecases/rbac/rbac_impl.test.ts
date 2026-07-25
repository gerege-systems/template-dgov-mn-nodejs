// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// rbac usecase-ийн unit тестүүд. Гол зорилго нь ЭРХ ОЛГОХ шийдвэрийн зөв байдал:
// admin/superadmin нь каталогийн бүх эрхийг автоматаар авна, кэш нь бичилтийн
// дараа шууд цэвэрлэгдэнэ, ашиглагдаж буй эрх устгагдахгүй.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType, conflict, is, notFound } from '../../apperror/index.js';
import type { RBACRepository } from '../../datasources/repositories/interface/rbac.js';
import type { Permission, Role } from '../../domain/rbac.js';
import { background, type Ctx } from '../../pkg/ctx/ctx.js';
import { newRBACUsecase, slugifyKey } from './rbac_impl.js';

function role(over: Partial<Role> = {}): Role {
  return {
    id: 3,
    key: 'manager',
    name: 'Менежер',
    description: '',
    isSystem: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

const catalog: Permission[] = [
  { key: 'dashboard.view', label: 'Хяналтын самбар', category: 'general' },
  { key: 'roles.manage', label: 'Эрх удирдах', category: 'administration' },
  { key: 'users.manage', label: 'Хэрэглэгч удирдах', category: 'administration' },
];

function mockRepo(over: Partial<RBACRepository> = {}): RBACRepository {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    listRoles: vi.fn(no),
    getRole: vi.fn(no),
    createRole: vi.fn(no),
    updateRole: vi.fn(no),
    deleteRole: vi.fn(no),
    countUsersWithRole: vi.fn(no),
    listPermissions: vi.fn(no),
    getRolePermissions: vi.fn(no),
    setRolePermissions: vi.fn(no),
    ...over,
  };
}

let ctx: Ctx;
beforeEach(() => {
  ctx = background();
});

describe('slugifyKey', () => {
  it('key хоосон бол name-ээс гаргана', () => {
    expect(slugifyKey('', 'Sales Manager')).toBe('sales_manager');
  });

  it('key өгвөл түүнийг нормчилно', () => {
    expect(slugifyKey('  Region-Admin ', 'ignored')).toBe('region_admin');
  });

  it('дараалсан тусгаарлагчийг нэг underscore болгож, хоёр талын underscore-ийг хасна', () => {
    expect(slugifyKey('__a -- b__', '')).toBe('a_b');
  });

  it('латин/тоо БИШ тэмдэгтийг бүрэн хасна', () => {
    // Go хувилбар нь зөвхөн a-z0-9 болон тусгаарлагчийг хүлээж авдаг.
    expect(slugifyKey('Менежер', '')).toBe('');
    expect(slugifyKey('a!@#b', '')).toBe('ab');
  });
});

describe('resolve', () => {
  it('admin нь каталогийн БҮХ эрхийг автоматаар авна', async () => {
    const repo = mockRepo({
      getRole: vi.fn(() => Promise.resolve(role({ id: 2, key: 'admin' }))),
      listPermissions: vi.fn(() => Promise.resolve(catalog)),
      getRolePermissions: vi.fn(() => Promise.reject(new Error('should not be called'))),
    });
    const keys = await newRBACUsecase(repo).resolve(ctx, 2);
    expect(keys).toEqual(['dashboard.view', 'roles.manage', 'users.manage']);
  });

  it('superadmin ч каталогийн бүх эрхийг авна', async () => {
    const repo = mockRepo({
      getRole: vi.fn(() => Promise.resolve(role({ id: 1, key: 'superadmin' }))),
      listPermissions: vi.fn(() => Promise.resolve(catalog)),
    });
    const keys = await newRBACUsecase(repo).resolve(ctx, 1);
    expect(keys).toHaveLength(3);
  });

  it('энгийн эрх нь ЗӨВХӨН оноогдсон түлхүүрүүдээ авч, эрэмбэлэгдэнэ', async () => {
    const repo = mockRepo({
      getRole: vi.fn(() => Promise.resolve(role())),
      getRolePermissions: vi.fn(() => Promise.resolve(['manager.view', 'dashboard.view'])),
    });
    const keys = await newRBACUsecase(repo).resolve(ctx, 3);
    expect(keys).toEqual(['dashboard.view', 'manager.view']);
  });

  it('кэшлэнэ — хоёр дахь дуудалт repo-д хүрэхгүй', async () => {
    const getRole = vi.fn(() => Promise.resolve(role()));
    const getRolePermissions = vi.fn(() => Promise.resolve(['manager.view']));
    const uc = newRBACUsecase(mockRepo({ getRole, getRolePermissions }));

    await uc.resolve(ctx, 3);
    await uc.resolve(ctx, 3);
    expect(getRole).toHaveBeenCalledTimes(1);
    expect(getRolePermissions).toHaveBeenCalledTimes(1);
  });

  it('TTL дууссаны дараа дахин уншина', async () => {
    const getRole = vi.fn(() => Promise.resolve(role()));
    const getRolePermissions = vi.fn(() => Promise.resolve(['manager.view']));
    let now = 1_000_000;
    const uc = newRBACUsecase(mockRepo({ getRole, getRolePermissions }), () => now);

    await uc.resolve(ctx, 3);
    now += 61_000; // TTL 60с
    await uc.resolve(ctx, 3);
    expect(getRole).toHaveBeenCalledTimes(2);
  });

  it('байхгүй эрх дээр notFound-ыг ХАДГАЛНА', async () => {
    const repo = mockRepo({ getRole: vi.fn(() => Promise.reject(notFound('role not found'))) });
    await expect(newRBACUsecase(repo).resolve(ctx, 99)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
  });
});

describe('кэшийн хүчингүй болголт', () => {
  it('setRolePermissions-ийн дараа resolve дахин уншина', async () => {
    const getRolePermissions = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['old.perm'])
      .mockResolvedValueOnce(['new.perm']);
    const uc = newRBACUsecase(
      mockRepo({
        getRole: vi.fn(() => Promise.resolve(role())),
        getRolePermissions,
        setRolePermissions: vi.fn(() => Promise.resolve()),
      }),
    );

    expect(await uc.resolve(ctx, 3)).toEqual(['old.perm']);
    await uc.setRolePermissions(ctx, 3, ['new.perm']);
    expect(await uc.resolve(ctx, 3)).toEqual(['new.perm']);
  });

  it('updateRole-ийн дараа ч кэш цэвэрлэгдэнэ', async () => {
    const getRolePermissions = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['a'])
      .mockResolvedValueOnce(['b']);
    const uc = newRBACUsecase(
      mockRepo({
        getRole: vi.fn(() => Promise.resolve(role())),
        getRolePermissions,
        updateRole: vi.fn(() => Promise.resolve(role({ name: 'Шинэ' }))),
        setRolePermissions: vi.fn(() => Promise.resolve()),
      }),
    );
    await uc.resolve(ctx, 3);
    await uc.updateRole(ctx, { id: 3, name: 'Шинэ', description: '', permissions: ['b'] });
    expect(await uc.resolve(ctx, 3)).toEqual(['b']);
  });
});

describe('createRole', () => {
  it('key-г slugify хийж дамжуулна', async () => {
    const createRole = vi.fn((_c, r: { key: string }) =>
      Promise.resolve(role({ id: 7, key: r.key })),
    );
    const uc = newRBACUsecase(
      mockRepo({ createRole, setRolePermissions: vi.fn(() => Promise.resolve()) }),
    );
    const out = await uc.createRole(ctx, {
      key: '',
      name: 'Sales Manager',
      description: 'd',
      permissions: ['dashboard.view'],
    });
    expect(out.key).toBe('sales_manager');
    expect(createRole).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ key: 'sales_manager', name: 'Sales Manager' }),
    );
  });

  it('slugify-ийн дараа key хоосон бол 400', async () => {
    await expect(
      newRBACUsecase(mockRepo()).createRole(ctx, {
        key: '###',
        name: '',
        description: '',
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('нэр хоосон бол 400', async () => {
    await expect(
      newRBACUsecase(mockRepo()).createRole(ctx, { key: 'ok_key', name: '   ', description: '' }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('permissions өгөөгүй бол setRolePermissions дуудахгүй', async () => {
    const setRolePermissions = vi.fn(() => Promise.resolve());
    const uc = newRBACUsecase(
      mockRepo({ createRole: vi.fn(() => Promise.resolve(role({ id: 7 }))), setRolePermissions }),
    );
    await uc.createRole(ctx, { key: 'k', name: 'N', description: '' });
    expect(setRolePermissions).not.toHaveBeenCalled();
  });

  it('давхардсан key дээр conflict-ыг ХАДГАЛНА', async () => {
    const repo = mockRepo({
      createRole: vi.fn(() => Promise.reject(conflict('role key already exists'))),
    });
    await expect(
      newRBACUsecase(repo).createRole(ctx, { key: 'admin', name: 'N', description: '' }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Conflict));
  });
});

describe('updateRole', () => {
  it('permissions БАЙХГҮЙ бол эрхийг хөндөхгүй', async () => {
    const setRolePermissions = vi.fn(() => Promise.resolve());
    const uc = newRBACUsecase(
      mockRepo({ updateRole: vi.fn(() => Promise.resolve(role())), setRolePermissions }),
    );
    await uc.updateRole(ctx, { id: 3, name: 'Нэр', description: '' });
    expect(setRolePermissions).not.toHaveBeenCalled();
  });

  it('permissions ХООСОН МАССИВ бол бүх эрхийг хасна', async () => {
    const setRolePermissions = vi.fn(() => Promise.resolve());
    const uc = newRBACUsecase(
      mockRepo({ updateRole: vi.fn(() => Promise.resolve(role())), setRolePermissions }),
    );
    await uc.updateRole(ctx, { id: 3, name: 'Нэр', description: '', permissions: [] });
    expect(setRolePermissions).toHaveBeenCalledWith(ctx, 3, []);
  });

  it('нэр хоосон бол 400 (repo хүрэхгүй)', async () => {
    const updateRole = vi.fn(() => Promise.resolve(role()));
    await expect(
      newRBACUsecase(mockRepo({ updateRole })).updateRole(ctx, {
        id: 3,
        name: ' ',
        description: '',
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
    expect(updateRole).not.toHaveBeenCalled();
  });
});

describe('deleteRole', () => {
  it('хэрэглэгчид ОНООГДСОН эрхийг устгуулахгүй (409)', async () => {
    const deleteRole = vi.fn(() => Promise.resolve());
    const uc = newRBACUsecase(
      mockRepo({ countUsersWithRole: vi.fn(() => Promise.resolve(4)), deleteRole }),
    );
    await expect(uc.deleteRole(ctx, 5)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Conflict),
    );
    expect(deleteRole).not.toHaveBeenCalled();
  });

  it('хэрэглэгчгүй эрхийг устгана', async () => {
    const deleteRole = vi.fn(() => Promise.resolve());
    const uc = newRBACUsecase(
      mockRepo({ countUsersWithRole: vi.fn(() => Promise.resolve(0)), deleteRole }),
    );
    await uc.deleteRole(ctx, 5);
    expect(deleteRole).toHaveBeenCalledWith(ctx, 5);
  });

  it('системийн эрхийн conflict-ыг ХАДГАЛНА', async () => {
    const uc = newRBACUsecase(
      mockRepo({
        countUsersWithRole: vi.fn(() => Promise.resolve(0)),
        deleteRole: vi.fn(() => Promise.reject(conflict('role not found or is a system role'))),
      }),
    );
    await expect(uc.deleteRole(ctx, 2)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Conflict),
    );
  });
});

describe('setRolePermissions', () => {
  it('байхгүй эрх дээр 404 (эрх чимээгүй оноогдохгүй)', async () => {
    const setRolePermissions = vi.fn(() => Promise.resolve());
    const uc = newRBACUsecase(
      mockRepo({
        getRole: vi.fn(() => Promise.reject(notFound('role not found'))),
        setRolePermissions,
      }),
    );
    await expect(uc.setRolePermissions(ctx, 99, ['a'])).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
    expect(setRolePermissions).not.toHaveBeenCalled();
  });
});

describe('listRoles', () => {
  it('эрх бүрийг оноогдсон түлхүүрүүдтэй нь буцаана', async () => {
    const uc = newRBACUsecase(
      mockRepo({
        listRoles: vi.fn(() =>
          Promise.resolve([role({ id: 2, key: 'admin' }), role({ id: 3, key: 'manager' })]),
        ),
        getRolePermissions: vi.fn((_c, id: number) =>
          Promise.resolve(id === 2 ? ['users.manage'] : ['manager.view']),
        ),
      }),
    );
    const list = await uc.listRoles(ctx);
    expect(list).toHaveLength(2);
    expect(list[0]?.permissions).toEqual(['users.manage']);
    expect(list[1]?.permissions).toEqual(['manager.view']);
  });

  it('түүхий repo алдааг дотоод алдаа болгож нуна', async () => {
    const uc = newRBACUsecase(
      mockRepo({ listRoles: vi.fn(() => Promise.reject(new Error('pq: relation missing'))) }),
    );
    await expect(uc.listRoles(ctx)).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Internal) && (e as Error).message === 'internal server error',
    );
  });
});
