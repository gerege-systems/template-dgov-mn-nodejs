// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { describe, expect, it } from 'vitest';

import {
  ErrEmptyCivilID,
  ErrEmptyPassword,
  ErrEmptyUsername,
  ErrInvalidEmail,
  RoleAdmin,
  RoleManager,
  RoleSuperAdmin,
  RoleUser,
  changePassword,
  fullName,
  fullNameEn,
  isAdmin,
  isSuperAdmin,
  newEIDUser,
  newUser,
  normalizeEmail,
  tokensRevokedBefore,
  verifyPassword,
} from './users.js';

// bcrypt cost-ыг тестүүдэд хамгийн бага (4) болгоно — 12 нь тест бүрт ~150 мс
// зарцуулж, хэдэн арван тест дээр мэдэгдэхүйц удаашрал болно.
const testCost = 4;

describe('normalizeEmail', () => {
  it('зай тайрч жижиг үсэг болгоно', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });
});

describe('newUser', () => {
  it('нууц үгийг hash хийж, и-мэйлийг нормчилно', () => {
    return newUser('batbayar', ' Bat@DGOV.mn ', 'Str0ng!Pass', RoleUser, testCost).then(
      async (u) => {
        expect(u.email).toBe('bat@dgov.mn');
        expect(u.password).not.toBe('Str0ng!Pass');
        expect(u.password.startsWith('$2')).toBe(true);
        expect(await verifyPassword(u, 'Str0ng!Pass')).toBe(true);
        expect(await verifyPassword(u, 'wrong')).toBe(false);
      },
    );
  });

  it('хоосон username-ийг татгалзана', async () => {
    await expect(newUser('  ', 'a@b.mn', 'p', RoleUser, testCost)).rejects.toBe(ErrEmptyUsername);
  });

  it('хоосон нууц үгийг татгалзана', async () => {
    await expect(newUser('bat', 'a@b.mn', '', RoleUser, testCost)).rejects.toBe(ErrEmptyPassword);
  });

  it('буруу и-мэйлийг татгалзана', async () => {
    await expect(newUser('bat', 'not-an-email', 'p', RoleUser, testCost)).rejects.toBe(
      ErrInvalidEmail,
    );
  });

  it('хязгаараас гадуурх bcrypt cost нь panic болгохгүй (default руу шилжинэ)', async () => {
    const u = await newUser('bat', 'a@b.mn', 'p', RoleUser, 99);
    expect(u.password.startsWith('$2')).toBe(true);
  });
});

describe('newEIDUser', () => {
  it('идэвхтэй, нууц үггүй, civil_id-д түлхүүрлэгдсэн хэрэглэгч үүсгэнэ', () => {
    const u = newEIDUser('AB12345678', 'Бат', 'Дорж', 'Bat', 'Dorj', '', 'ADVANCED');
    expect(u.username).toBe('eid_ab12345678');
    expect(u.civilId).toBe('ab12345678');
    expect(u.active).toBe(true);
    expect(u.password).toBe('');
    expect(u.email).toBe('');
    expect(u.roleId).toBe(RoleUser);
    expect(u.kycLevel).toBe('ADVANCED');
  });

  it('нууц үггүй хэрэглэгч нууц үгээр хэзээ ч нэвтэрч чадахгүй', async () => {
    const u = newEIDUser('ab1', 'Бат', 'Дорж', '', '', '', 'ADVANCED');
    expect(await verifyPassword(u, '')).toBe(false);
    expect(await verifyPassword(u, 'anything')).toBe(false);
  });

  it('civil_id дутуу бол татгалзана', () => {
    expect(() => newEIDUser('  ', 'Бат', 'Дорж', '', '', '', '')).toThrow(ErrEmptyCivilID);
  });
});

describe('fullName', () => {
  it('монгол хэлбэрээр "Овог Нэр" буцаана', () => {
    expect(fullName({ lastName: 'Дорж', firstName: 'Бат' })).toBe('Дорж Бат');
  });

  it('хоёулаа хоосон бол хоосон мөр', () => {
    expect(fullName({ lastName: ' ', firstName: '' })).toBe('');
  });

  it('англи хэлбэрийг мөн буцаана', () => {
    expect(fullNameEn({ lastNameEn: 'Dorj', firstNameEn: 'Bat' })).toBe('Dorj Bat');
  });
});

describe('role predicates', () => {
  it('admin болон super admin хоёулаа admin эрхтэй', () => {
    expect(isAdmin({ roleId: RoleAdmin })).toBe(true);
    expect(isAdmin({ roleId: RoleSuperAdmin })).toBe(true);
    expect(isAdmin({ roleId: RoleManager })).toBe(false);
    expect(isAdmin({ roleId: RoleUser })).toBe(false);
  });

  it('зөвхөн super admin нь isSuperAdmin', () => {
    expect(isSuperAdmin({ roleId: RoleSuperAdmin })).toBe(true);
    expect(isSuperAdmin({ roleId: RoleAdmin })).toBe(false);
  });
});

describe('changePassword', () => {
  it('hash-ийг сольж, хүчингүй болгох тасалбарыг тэмдэглэнэ', async () => {
    const u = await newUser('bat', 'a@b.mn', 'Old!Pass1', RoleUser, testCost);
    expect(tokensRevokedBefore(u)).toBeNull();
    const before = u.password;
    await changePassword(u, 'New!Pass1', testCost);
    expect(u.password).not.toBe(before);
    expect(await verifyPassword(u, 'New!Pass1')).toBe(true);
    expect(await verifyPassword(u, 'Old!Pass1')).toBe(false);
    expect(tokensRevokedBefore(u)).toBeInstanceOf(Date);
    expect(u.updatedAt).toBeInstanceOf(Date);
  });

  it('хоосон нууц үгийг татгалзана', async () => {
    const u = await newUser('bat', 'a@b.mn', 'Old!Pass1', RoleUser, testCost);
    await expect(changePassword(u, '', testCost)).rejects.toBe(ErrEmptyPassword);
  });
});
