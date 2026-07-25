// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// org usecase-ийн unit тестүүд. Гол зорилго: эрх ахиулах бүх зам хаалттай байх —
//   • гишүүн биш хүн байгууллага БАЙГАА эсэхийг мэдэхгүй (403, 404 биш)
//   • энгийн member гишүүд удирдахгүй
//   • owner дүрийг ЗӨВХӨН owner олгоно
//   • owner-ийн дүрийг өөрчилж/хасаж болохгүй (эзэнгүй байгууллагаас сэргийлнэ)

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is, notFound } from '../../apperror/index.js';
import type {
  NewMembership,
  NewOrganization,
  OrgRepository,
} from '../../datasources/repositories/interface/org.js';
import type { Organization, OrganizationMembership } from '../../domain/org.js';
import { OrgRole } from '../../domain/org.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newOrgUsecase } from './org_usecase.js';

const callerId = '11111111-1111-1111-1111-111111111111';
const targetId = '22222222-2222-2222-2222-222222222222';
const orgId = '33333333-3333-3333-3333-333333333333';

function org(over: Partial<Organization> = {}): Organization {
  return {
    id: orgId,
    regNo: '1234567',
    name: 'Гэрэгэ Системс ХХК',
    nameLatin: 'Gerege Systems LLC',
    createdBy: callerId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

function membership(over: Partial<OrganizationMembership> = {}): OrganizationMembership {
  return {
    orgId,
    userId: callerId,
    role: OrgRole.Member,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

/**
 * mockRepo — getMembership нь дуудагч болон бай (target) хоёуланд ажиллах ёстой
 * тул userId-аар салгаж хариулна.
 */
function mockRepo(over: Partial<OrgRepository> = {}): OrgRepository {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    createOrg: vi.fn(() => Promise.resolve(org())),
    getOrgById: vi.fn(() => Promise.resolve(org())),
    getOrgByRegNo: vi.fn(() => Promise.resolve(org())),
    listOrgsForUser: vi.fn(() => Promise.resolve([org()])),
    getMembership: vi.fn(no),
    listMembers: vi.fn(() => Promise.resolve([membership()])),
    addMember: vi.fn(() => Promise.resolve(membership({ userId: targetId }))),
    updateMemberRole: vi.fn(() => Promise.resolve()),
    removeMember: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

/** memberships нь (userId → дүр) зураглалаар getMembership-ийг хуурамчилна. */
function memberships(map: Record<string, string>) {
  return vi.fn((_ctx: unknown, _orgId: string, userId: string) => {
    const role = map[userId];
    if (role === undefined) return Promise.reject(notFound('membership not found'));
    return Promise.resolve(membership({ userId, role }));
  });
}

describe('байгууллага үүсгэх', () => {
  it('хоосон зайг зассан утгыг хадгална', async () => {
    const createOrg = vi.fn((_ctx: unknown, _in: NewOrganization) => Promise.resolve(org()));
    const uc = newOrgUsecase(mockRepo({ createOrg }));

    await uc.createOrganization(background(), {
      callerId,
      regNo: '  1234567 ',
      name: '  Гэрэгэ  ',
      nameLatin: '  Gerege  ',
    });

    expect(createOrg.mock.calls[0]?.[1]).toEqual({
      regNo: '1234567',
      name: 'Гэрэгэ',
      nameLatin: 'Gerege',
      createdBy: callerId,
    });
  });

  it('регистр эсвэл нэр хоосон бол 400 — DB-д хүрэхгүй', async () => {
    const createOrg = vi.fn(() => Promise.resolve(org()));
    const uc = newOrgUsecase(mockRepo({ createOrg }));

    await expect(
      uc.createOrganization(background(), { callerId, regNo: ' ', name: 'X', nameLatin: '' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    await expect(
      uc.createOrganization(background(), { callerId, regNo: '1', name: '  ', nameLatin: '' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(createOrg).not.toHaveBeenCalled();
  });
});

describe('унших эрх', () => {
  it('гишүүн биш хүн гишүүдийг ХАРАХГҮЙ (403)', async () => {
    const listMembers = vi.fn(() => Promise.resolve([membership()]));
    const uc = newOrgUsecase(mockRepo({ getMembership: memberships({}), listMembers }));

    await expect(uc.listMembers(background(), callerId, orgId)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('энгийн гишүүн жагсаалтыг харна', async () => {
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Member }) }),
    );
    await expect(uc.listMembers(background(), callerId, orgId)).resolves.toHaveLength(1);
  });

  it('regNo хоосон бол хайлт 400', async () => {
    const uc = newOrgUsecase(mockRepo());
    await expect(uc.lookupByRegNo(background(), '  ')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
  });
});

describe('гишүүн нэмэх', () => {
  it('энгийн member гишүүн НЭМЖ ЧАДАХГҮЙ (403)', async () => {
    const addMember = vi.fn(() => Promise.resolve(membership()));
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Member }), addMember }),
    );

    await expect(
      uc.addMember(background(), { callerId, orgId, userId: targetId, role: '' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
    expect(addMember).not.toHaveBeenCalled();
  });

  it('admin нь member нэмнэ; дүр хоосон бол өгөгдмөл "member"', async () => {
    const addMember = vi.fn((_ctx: unknown, _in: NewMembership) =>
      Promise.resolve(membership({ userId: targetId })),
    );
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Admin }), addMember }),
    );

    await uc.addMember(background(), { callerId, orgId, userId: targetId, role: '' });

    expect(addMember.mock.calls[0]?.[1]).toEqual({
      orgId,
      userId: targetId,
      role: OrgRole.Member,
    });
  });

  it('admin нь OWNER дүр олгож ЧАДАХГҮЙ (эрх ахиулах зам хаалттай)', async () => {
    const addMember = vi.fn(() => Promise.resolve(membership()));
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Admin }), addMember }),
    );

    await expect(
      uc.addMember(background(), { callerId, orgId, userId: targetId, role: OrgRole.Owner }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
    expect(addMember).not.toHaveBeenCalled();
  });

  it('owner нь OWNER дүр олгож чадна', async () => {
    const addMember = vi.fn(() => Promise.resolve(membership({ role: OrgRole.Owner })));
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Owner }), addMember }),
    );

    await uc.addMember(background(), { callerId, orgId, userId: targetId, role: OrgRole.Owner });

    expect(addMember).toHaveBeenCalled();
  });

  it('танихгүй дүр 400', async () => {
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Owner }) }),
    );
    await expect(
      uc.addMember(background(), { callerId, orgId, userId: targetId, role: 'superuser' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('userId хоосон бол 400', async () => {
    const uc = newOrgUsecase(
      mockRepo({ getMembership: memberships({ [callerId]: OrgRole.Owner }) }),
    );
    await expect(
      uc.addMember(background(), { callerId, orgId, userId: '  ', role: '' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });
});

describe('гишүүний дүр солих', () => {
  it('OWNER-ийн дүрийг өөрчилж БОЛОХГҮЙ (хасах хамгаалалтыг тойрохоос сэргийлнэ)', async () => {
    const updateMemberRole = vi.fn(() => Promise.resolve());
    const uc = newOrgUsecase(
      mockRepo({
        getMembership: memberships({ [callerId]: OrgRole.Admin, [targetId]: OrgRole.Owner }),
        updateMemberRole,
      }),
    );

    await expect(
      uc.updateMemberRole(background(), {
        callerId,
        orgId,
        userId: targetId,
        role: OrgRole.Member,
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it('admin нь member-ийг admin болгож чадна', async () => {
    const updateMemberRole = vi.fn(() => Promise.resolve());
    const uc = newOrgUsecase(
      mockRepo({
        getMembership: memberships({ [callerId]: OrgRole.Admin, [targetId]: OrgRole.Member }),
        updateMemberRole,
      }),
    );

    await uc.updateMemberRole(background(), {
      callerId,
      orgId,
      userId: targetId,
      role: OrgRole.Admin,
    });

    expect(updateMemberRole).toHaveBeenCalledWith(
      expect.anything(),
      orgId,
      targetId,
      OrgRole.Admin,
    );
  });

  it('admin нь OWNER дүр олгож чадахгүй', async () => {
    const uc = newOrgUsecase(
      mockRepo({
        getMembership: memberships({ [callerId]: OrgRole.Admin, [targetId]: OrgRole.Member }),
      }),
    );
    await expect(
      uc.updateMemberRole(background(), {
        callerId,
        orgId,
        userId: targetId,
        role: OrgRole.Owner,
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
  });

  it('танихгүй дүр 400 — эрх ч шалгагдахгүй', async () => {
    const getMembership = memberships({ [callerId]: OrgRole.Owner });
    const uc = newOrgUsecase(mockRepo({ getMembership }));
    await expect(
      uc.updateMemberRole(background(), { callerId, orgId, userId: targetId, role: 'root' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(getMembership).not.toHaveBeenCalled();
  });
});

describe('гишүүн хасах', () => {
  it('OWNER-ийг хасаж БОЛОХГҮЙ (байгууллага эзэнгүй үлдэхээс сэргийлнэ)', async () => {
    const removeMember = vi.fn(() => Promise.resolve());
    const uc = newOrgUsecase(
      mockRepo({
        getMembership: memberships({ [callerId]: OrgRole.Admin, [targetId]: OrgRole.Owner }),
        removeMember,
      }),
    );

    await expect(
      uc.removeMember(background(), { callerId, orgId, userId: targetId }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('admin нь энгийн гишүүнийг хасна', async () => {
    const removeMember = vi.fn(() => Promise.resolve());
    const uc = newOrgUsecase(
      mockRepo({
        getMembership: memberships({ [callerId]: OrgRole.Admin, [targetId]: OrgRole.Member }),
        removeMember,
      }),
    );

    await uc.removeMember(background(), { callerId, orgId, userId: targetId });

    expect(removeMember).toHaveBeenCalledWith(expect.anything(), orgId, targetId);
  });

  it('гишүүн биш хүн хасаж чадахгүй (403)', async () => {
    const uc = newOrgUsecase(mockRepo({ getMembership: memberships({}) }));
    await expect(
      uc.removeMember(background(), { callerId, orgId, userId: targetId }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
  });

  it('repository-ийн жинхэнэ алдаа 403 болж НУУГДАХГҮЙ (internal хэвээр)', async () => {
    const uc = newOrgUsecase(
      mockRepo({ getMembership: vi.fn(() => Promise.reject(new Error('connection reset'))) }),
    );
    await expect(
      uc.removeMember(background(), { callerId, orgId, userId: targetId }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Internal));
  });
});
