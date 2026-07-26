// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/org нь байгууллага болон гишүүнчлэлийг хариуцна: байгууллага үүсгэх,
// өөрийн байгууллагуудыг жагсаах, дугаараар хайх, гишүүн нэмэх/хасах/дүр солих.
//
// ЭРХ ОЛГОЛТ (owner/admin эсэх) нь ЭНЭ давхаргад хэрэгжинэ — RLS зөвхөн мөрийн
// харагдах байдлыг хариуцна. callerId нь Request бүрд орсон: нэвтэрсэн
// хэрэглэгчийн UUID, бүх эрхийн шийдвэр үүнд тулгуурлана.

import { asDomainError, badRequest, forbidden, internalCause } from '../../apperror/index.js';
import type { OrgRepository } from '../../datasources/repositories/interface/org.js';
import type { Organization, OrganizationMembership } from '../../domain/org.js';
import { canManageMembers, isValidOrgRole, OrgRole } from '../../domain/org.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

export interface CreateOrganizationRequest {
  callerId: string;
  regNo: string;
  name: string;
  nameLatin: string;
}

export interface AddMemberRequest {
  callerId: string;
  orgId: string;
  userId: string;
  role: string;
}

export interface UpdateMemberRoleRequest {
  callerId: string;
  orgId: string;
  userId: string;
  role: string;
}

export interface RemoveMemberRequest {
  callerId: string;
  orgId: string;
  userId: string;
}

export interface OrgUsecase {
  /** createOrganization нь шинэ байгууллага үүсгэж, дуудагчийг owner болгоно. */
  createOrganization(ctx: Ctx, req: CreateOrganizationRequest): Promise<Organization>;
  /** listMyOrganizations нь дуудагч гишүүн болсон байгууллагуудыг буцаана. */
  listMyOrganizations(ctx: Ctx, callerId: string): Promise<Organization[]>;
  /**
   * getOrganization нь нэг байгууллагыг буцаана. RLS нь энгийн хэрэглэгчид
   * зөвхөн гишүүн болсон org-оо харуулдаг тул "байхгүй" ба "эрхгүй" НЭГ ижил
   * 404 болно.
   */
  getOrganization(ctx: Ctx, orgId: string): Promise<Organization>;
  /** lookupByRegNo нь бүртгэлийн дугаараар байгууллагыг хайна. */
  lookupByRegNo(ctx: Ctx, regNo: string): Promise<Organization>;
  /** listMembers нь гишүүдийг буцаана (дуудагч гишүүн байх ЁСТОЙ). */
  listMembers(ctx: Ctx, callerId: string, orgId: string): Promise<OrganizationMembership[]>;
  /** addMember нь гишүүн нэмнэ (дуудагч owner/admin байх ЁСТОЙ). */
  addMember(ctx: Ctx, req: AddMemberRequest): Promise<OrganizationMembership>;
  /** updateMemberRole нь гишүүний дүрийг солино (дуудагч owner/admin). */
  updateMemberRole(ctx: Ctx, req: UpdateMemberRoleRequest): Promise<void>;
  /** removeMember нь гишүүнийг хасна (дуудагч owner/admin). */
  removeMember(ctx: Ctx, req: RemoveMemberRequest): Promise<void>;
}

class OrgUsecaseImpl implements OrgUsecase {
  constructor(private readonly repo: OrgRepository) {}

  /**
   * requireManager нь дуудагч тухайн байгууллагад owner/admin гишүүн эсэхийг
   * шалгана — гишүүн нэмэх/хасах/дүр солих эрхийн НЭГДСЭН хаалга.
   *
   * Гишүүн БИШ дуудагчид "байхгүй" гэдгийг илчлэхгүйгээр Forbidden буцаана.
   * Амжилттай бол дуудагчийн гишүүнчлэлийг буцаана — owner-only дүрмүүд
   * (owner дүр олгох г.м.) дуудагчийн дүрийг шаарддаг.
   */
  private async requireManager(
    ctx: Ctx,
    orgId: string,
    callerId: string,
  ): Promise<OrganizationMembership> {
    let m: OrganizationMembership;
    try {
      m = await this.repo.getMembership(ctx, orgId, callerId);
    } catch (err) {
      // Repository-ийн домэйн алдаа (NotFound) → "эрхгүй": гишүүн биш хүнд
      // байгууллага БАЙГАА эсэхийг илчлэхгүй.
      if (asDomainError(err)) throw forbidden('you are not allowed to manage this organization');
      throw internalCause(err);
    }
    if (!canManageMembers(m.role)) {
      throw forbidden('you are not allowed to manage this organization');
    }
    return m;
  }

  /** requireMember нь дуудагч гишүүн эсэхийг шалгана (унших эрх). */
  private async requireMember(ctx: Ctx, orgId: string, callerId: string): Promise<void> {
    try {
      await this.repo.getMembership(ctx, orgId, callerId);
    } catch (err) {
      if (asDomainError(err)) throw forbidden('you are not a member of this organization');
      throw internalCause(err);
    }
  }

  async createOrganization(ctx: Ctx, req: CreateOrganizationRequest): Promise<Organization> {
    const regNo = req.regNo.trim();
    const name = req.name.trim();
    if (regNo === '') throw badRequest('registration number is required');
    if (name === '') throw badRequest('organization name is required');
    return await this.repo.createOrg(ctx, {
      regNo,
      name,
      nameLatin: req.nameLatin.trim(),
      createdBy: req.callerId,
    });
  }

  async listMyOrganizations(ctx: Ctx, callerId: string): Promise<Organization[]> {
    return await this.repo.listOrgsForUser(ctx, callerId);
  }

  async getOrganization(ctx: Ctx, orgId: string): Promise<Organization> {
    return await this.repo.getOrgById(ctx, orgId);
  }

  async lookupByRegNo(ctx: Ctx, regNo: string): Promise<Organization> {
    const trimmed = regNo.trim();
    if (trimmed === '') throw badRequest('registration number is required');
    return await this.repo.getOrgByRegNo(ctx, trimmed);
  }

  async listMembers(ctx: Ctx, callerId: string, orgId: string): Promise<OrganizationMembership[]> {
    await this.requireMember(ctx, orgId, callerId);
    return await this.repo.listMembers(ctx, orgId);
  }

  async addMember(ctx: Ctx, req: AddMemberRequest): Promise<OrganizationMembership> {
    const role = req.role.trim() === '' ? OrgRole.Member : req.role.trim();
    if (!isValidOrgRole(role)) throw badRequest('invalid membership role');
    if (req.userId.trim() === '') throw badRequest('user id is required');

    const caller = await this.requireManager(ctx, req.orgId, req.callerId);
    // owner дүрийг ЗӨВХӨН owner олгоно — org admin өөрөөсөө дээш дүрийг (өөрт
    // нь эсвэл бусдад) олгож эрх ахиулахаас сэргийлнэ.
    if (role === OrgRole.Owner && caller.role !== OrgRole.Owner) {
      throw forbidden('only the owner can grant the owner role');
    }
    return await this.repo.addMember(ctx, { orgId: req.orgId, userId: req.userId, role });
  }

  /**
   * updateMemberRole нь гишүүний дүрийг солино. Owner-ийн дүрд ХОЁР нэмэлт
   * хамгаалалт бий: owner дүрийг зөвхөн owner олгоно, мөн owner-ийн дүрийг
   * ӨӨРЧИЛЖ болохгүй — эс бөгөөс org admin owner-ыг member болгож бууруулаад
   * дараа нь removeMember-ээр хасч, "owner-ыг хасахгүй" хамгаалалтыг тойрно.
   */
  async updateMemberRole(ctx: Ctx, req: UpdateMemberRoleRequest): Promise<void> {
    const role = req.role.trim();
    if (!isValidOrgRole(role)) throw badRequest('invalid membership role');

    const caller = await this.requireManager(ctx, req.orgId, req.callerId);
    if (role === OrgRole.Owner && caller.role !== OrgRole.Owner) {
      throw forbidden('only the owner can grant the owner role');
    }
    const target = await this.repo.getMembership(ctx, req.orgId, req.userId);
    if (target.role === OrgRole.Owner) {
      throw badRequest("the organization owner's role cannot be changed");
    }
    await this.repo.updateMemberRole(ctx, req.orgId, req.userId, role);
  }

  /**
   * removeMember нь гишүүнийг хасна. Owner-ийг хасахаас сэргийлнэ —
   * байгууллага эзэнгүй үлдэхээс хамгаална.
   */
  async removeMember(ctx: Ctx, req: RemoveMemberRequest): Promise<void> {
    await this.requireManager(ctx, req.orgId, req.callerId);
    const target = await this.repo.getMembership(ctx, req.orgId, req.userId);
    if (target.role === OrgRole.Owner) {
      throw badRequest('the organization owner cannot be removed');
    }
    await this.repo.removeMember(ctx, req.orgId, req.userId);
  }
}

export const newOrgUsecase = (repo: OrgRepository): OrgUsecase => new OrgUsecaseImpl(repo);
