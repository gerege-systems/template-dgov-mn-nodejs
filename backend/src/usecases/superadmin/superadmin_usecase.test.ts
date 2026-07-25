// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Super admin давхаргын unit тестүүд. Гол баталгаанууд:
//   • ЗӨВХӨН admin зэрэглэл олгогдоно — super admin API-аар ХЭЗЭЭ Ч үүсэхгүй;
//   • өөрийгөө хасах болон super admin-г хасах нь 403 (lockout хаалт);
//   • регистрээр админ нэмэх нь БАЙГАА хэрэглэгчийг л дэвшүүлнэ (шинэ үүсгэхгүй);
//   • audit бичилтийн алдаа үндсэн үйлдлийг унагахгүй (best-effort).

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type { SuperadminInviteRepository } from '../../datasources/repositories/interface/superadmin.js';
import type { SuperadminInvite } from '../../domain/superadmin_account.js';
import { emptyUser, RoleAdmin, RoleSuperAdmin, RoleUser } from '../../domain/users.js';
import type { User } from '../../domain/users.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { AuditUsecase } from '../audit/audit_usecase.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { newSuperadminUsecase, type AccessModeStore } from './superadmin_usecase.js';

const ctx: Ctx = background();

const user = (over: Partial<User> = {}): User => ({
  ...emptyUser(),
  id: 'u-1',
  username: 'иргэн',
  email: 'bat@dgov.mn',
  roleId: RoleUser,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const invite = (over: Partial<SuperadminInvite> = {}): SuperadminInvite => ({
  email: 'new@dgov.mn',
  invitedBy: 'boss@dgov.mn',
  createdAt: new Date(),
  acceptedAt: null,
  ...over,
});

interface UsersStub {
  getById?: UsersUsecase['getById'];
  getByNationalId?: UsersUsecase['getByNationalId'];
  listAdmins?: UsersUsecase['listAdmins'];
  store?: UsersUsecase['store'];
  setActive?: UsersUsecase['setActive'];
  updateRole?: UsersUsecase['updateRole'];
}

function fakeUsers(over: UsersStub = {}): UsersUsecase {
  return {
    getById: () => Promise.resolve({ user: user() }),
    getByNationalId: () => Promise.reject(notFound('user not found')),
    listAdmins: () => Promise.resolve({ users: [user({ roleId: RoleAdmin })] }),
    store: (_c: Ctx, req: { user: User }) =>
      Promise.resolve({ user: { ...req.user, id: 'new-1', active: false } }),
    setActive: () => Promise.resolve(),
    updateRole: () => Promise.resolve(),
    ...over,
  } as unknown as UsersUsecase;
}

const fakeAudit = (record?: AuditUsecase['recordEvent']): AuditUsecase =>
  ({ recordEvent: record ?? (() => Promise.resolve()) }) as unknown as AuditUsecase;

function fakeInvites(over: Partial<SuperadminInviteRepository> = {}): SuperadminInviteRepository {
  return {
    list: () => Promise.resolve([invite()]),
    getByEmail: () => Promise.resolve(invite()),
    create: (_c: Ctx, email: string, invitedBy: string) =>
      Promise.resolve(invite({ email, invitedBy })),
    deleteInvite: () => Promise.resolve(),
    markAccepted: () => Promise.resolve(),
    ...over,
  };
}

const fakeAccess = (mode = 'public'): AccessModeStore => ({
  getAccessMode: () => Promise.resolve(mode),
  setAccessMode: () => Promise.resolve(),
});

describe('createAdmin', () => {
  it('шинэ админыг ИДЭВХЖҮҮЛЖ буцаана (store нь идэвхгүй мөр өгдөг)', async () => {
    const setActive = vi.fn((_c: Ctx, _r: { userId: string; active: boolean }) =>
      Promise.resolve(),
    );
    const uc = newSuperadminUsecase(
      fakeUsers({ setActive }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    const out = await uc.createAdmin(ctx, {
      username: 'admin1',
      email: 'admin1@dgov.mn',
      password: 'Passw0rd!',
      firstName: 'Бат',
      lastName: 'Дорж',
      firstNameEn: '',
      lastNameEn: '',
    });
    expect(out.roleId).toBe(RoleAdmin);
    expect(out.active).toBe(true);
    expect(setActive).toHaveBeenCalledWith(expect.anything(), { userId: 'new-1', active: true });
  });

  it('audit бичилт унасан ч админ үүснэ (best-effort)', async () => {
    const uc = newSuperadminUsecase(
      fakeUsers(),
      fakeAudit(() => Promise.reject(new Error('audit down'))),
      fakeInvites(),
      fakeAccess(),
    );
    await expect(
      uc.createAdmin(ctx, {
        username: 'admin1',
        email: 'a@dgov.mn',
        password: 'Passw0rd!',
        firstName: '',
        lastName: '',
        firstNameEn: '',
        lastNameEn: '',
      }),
    ).resolves.toMatchObject({ roleId: RoleAdmin });
  });
});

describe('grantAdmin', () => {
  it('super admin-ий нэрийн өмнөөс ЗӨВХӨН admin зэрэглэл олгоно', async () => {
    const updateRole = vi.fn(
      (_c: Ctx, _r: { userId: string; roleId: number; callerRoleId: number }) => Promise.resolve(),
    );
    const uc = newSuperadminUsecase(
      fakeUsers({ updateRole }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await uc.grantAdmin(ctx, 'u-1');
    expect(updateRole).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u-1',
      roleId: RoleAdmin,
      callerRoleId: RoleSuperAdmin,
    });
  });

  it('аль хэдийн админд 409', async () => {
    const uc = newSuperadminUsecase(
      fakeUsers({ getById: () => Promise.resolve({ user: user({ roleId: RoleAdmin }) }) }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await expect(uc.grantAdmin(ctx, 'u-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Conflict),
    );
  });

  it('super admin-д ч 409 (дэвшүүлэх утгагүй)', async () => {
    const uc = newSuperadminUsecase(
      fakeUsers({ getById: () => Promise.resolve({ user: user({ roleId: RoleSuperAdmin }) }) }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await expect(uc.grantAdmin(ctx, 'u-1')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Conflict),
    );
  });
});

describe('revokeAdmin', () => {
  it('өөрийгөө хасах нь 403 (lockout хаалт)', async () => {
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), fakeInvites(), fakeAccess());
    await expect(uc.revokeAdmin(ctx, 'me', 'me')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('super admin-г хасах нь 403', async () => {
    const uc = newSuperadminUsecase(
      fakeUsers({ getById: () => Promise.resolve({ user: user({ roleId: RoleSuperAdmin }) }) }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await expect(uc.revokeAdmin(ctx, 'u-1', 'boss')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Forbidden),
    );
  });

  it('админ биш хэрэглэгчийг хасах нь 400', async () => {
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), fakeInvites(), fakeAccess());
    await expect(uc.revokeAdmin(ctx, 'u-1', 'boss')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('админыг энгийн хэрэглэгч болгоно', async () => {
    const updateRole = vi.fn(
      (_c: Ctx, _r: { userId: string; roleId: number; callerRoleId: number }) => Promise.resolve(),
    );
    const uc = newSuperadminUsecase(
      fakeUsers({
        getById: () => Promise.resolve({ user: user({ roleId: RoleAdmin }) }),
        updateRole,
      }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await uc.revokeAdmin(ctx, 'u-1', 'boss');
    expect(updateRole).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u-1',
      roleId: RoleUser,
      callerRoleId: RoleSuperAdmin,
    });
  });
});

describe('регистрээр админ нэмэх', () => {
  it('платформд байхгүй регистр нь 404 — шинэ хэрэглэгч ҮҮСГЭХГҮЙ', async () => {
    const store = vi.fn(() => Promise.resolve({ user: user() }));
    const uc = newSuperadminUsecase(fakeUsers({ store }), fakeAudit(), fakeInvites(), fakeAccess());
    await expect(uc.addAdminByRegister(ctx, 'УБ12345678')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.NotFound),
    );
    expect(store).not.toHaveBeenCalled();
  });

  it('хоосон регистр нь 400', async () => {
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), fakeInvites(), fakeAccess());
    await expect(uc.addAdminByRegister(ctx, '   ')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('регистрийг ИХ үсэг рүү нормчилж хайна', async () => {
    const getByNationalId = vi.fn((_c: Ctx, _r: { nationalId: string }) =>
      Promise.resolve({ user: user() }),
    );
    const uc = newSuperadminUsecase(
      fakeUsers({ getByNationalId }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await uc.addAdminByRegister(ctx, ' уб12345678 ');
    expect(getByNationalId).toHaveBeenCalledWith(expect.anything(), { nationalId: 'УБ12345678' });
  });

  it('аль хэдийн админ бол 409', async () => {
    const uc = newSuperadminUsecase(
      fakeUsers({
        getByNationalId: () => Promise.resolve({ user: user({ roleId: RoleAdmin }) }),
      }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    await expect(uc.addAdminByRegister(ctx, 'УБ1234567')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.Conflict),
    );
  });

  it('lookup нь эрх ОЛГОХГҮЙ (preview)', async () => {
    const updateRole = vi.fn(() => Promise.resolve());
    const uc = newSuperadminUsecase(
      fakeUsers({ getByNationalId: () => Promise.resolve({ user: user() }), updateRole }),
      fakeAudit(),
      fakeInvites(),
      fakeAccess(),
    );
    const found = await uc.lookupByRegister(ctx, 'УБ1234567');
    expect(found.roleId).toBe(RoleUser);
    expect(updateRole).not.toHaveBeenCalled();
  });
});

describe('урилга (allow-list)', () => {
  it('и-мэйлийг нормчилж хадгална', async () => {
    const create = vi.fn((_c: Ctx, email: string, invitedBy: string) =>
      Promise.resolve(invite({ email, invitedBy })),
    );
    const uc = newSuperadminUsecase(
      fakeUsers(),
      fakeAudit(),
      fakeInvites({ create }),
      fakeAccess(),
    );
    const out = await uc.createInvite(ctx, '  NEW@Dgov.MN ', ' BOSS@dgov.mn');
    expect(out.email).toBe('new@dgov.mn');
    expect(create).toHaveBeenCalledWith(expect.anything(), 'new@dgov.mn', 'boss@dgov.mn');
  });

  it('буруу и-мэйл нь 400', async () => {
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), fakeInvites(), fakeAccess());
    await expect(uc.createInvite(ctx, 'not-an-email', 'boss@dgov.mn')).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.BadRequest),
    );
  });

  it('хоосон и-мэйл нь 400', async () => {
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), fakeInvites(), fakeAccess());
    await expect(uc.deleteInvite(ctx, '  ')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('урилгын хадгалалт тохируулаагүй бол 500', async () => {
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), null, fakeAccess());
    await expect(uc.listInvites(ctx)).rejects.toSatisfy((e: unknown) => is(e, ErrorType.Internal));
  });
});

describe('хандалтын горим', () => {
  it('store-оос уншиж/бичнэ', async () => {
    const setAccessMode = vi.fn((_c: Ctx, _m: string) => Promise.resolve());
    const uc = newSuperadminUsecase(fakeUsers(), fakeAudit(), fakeInvites(), {
      getAccessMode: () => Promise.resolve('private'),
      setAccessMode,
    });
    expect(await uc.getAccessMode(ctx)).toBe('private');
    await uc.setAccessMode(ctx, 'public');
    expect(setAccessMode).toHaveBeenCalledWith(expect.anything(), 'public');
  });
});
