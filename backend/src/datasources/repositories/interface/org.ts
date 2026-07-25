// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Organization, OrganizationMembership } from '../../../domain/org.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/** NewOrganization нь үүсгэхэд шаардлагатай талбарууд (id/огноог DB өгнө). */
export interface NewOrganization {
  regNo: string;
  name: string;
  nameLatin: string;
  createdBy: string;
}

/** NewMembership нь гишүүн нэмэхэд шаардлагатай талбарууд. */
export interface NewMembership {
  orgId: string;
  userId: string;
  role: string;
}

/**
 * OrgRepository нь organizations + organization_memberships хүснэгтүүдийн
 * gateway. Эрх олголт (owner/admin эсэх) нь USECASE давхаргад — энэ давхарга
 * зөвхөн RLS-ийн харагдах байдлыг хариуцна.
 */
export interface OrgRepository {
  /** createOrg нь байгууллага + үүсгэгчийн owner гишүүнчлэлийг НЭГ транзакцид бичнэ. */
  createOrg(ctx: Ctx, input: NewOrganization): Promise<Organization>;
  /** getOrgById нь primary key-ээр байгууллагыг хайна (soft-delete-ийг хасна). */
  getOrgById(ctx: Ctx, id: string): Promise<Organization>;
  /** getOrgByRegNo нь бүртгэлийн дугаараар (case-insensitive) хайна. */
  getOrgByRegNo(ctx: Ctx, regNo: string): Promise<Organization>;
  /** listOrgsForUser нь хэрэглэгч гишүүн болсон бүх идэвхтэй байгууллагыг буцаана. */
  listOrgsForUser(ctx: Ctx, userId: string): Promise<Organization[]>;
  /** getMembership нь (orgId, userId) хосын гишүүнчлэлийг буцаана. */
  getMembership(ctx: Ctx, orgId: string, userId: string): Promise<OrganizationMembership>;
  /** listMembers нь байгууллагын бүх гишүүнийг буцаана. */
  listMembers(ctx: Ctx, orgId: string): Promise<OrganizationMembership[]>;
  /** addMember нь гишүүн нэмнэ; аль хэдийн гишүүн бол Conflict. */
  addMember(ctx: Ctx, input: NewMembership): Promise<OrganizationMembership>;
  /** updateMemberRole нь гишүүний дүрийг солино; гишүүн биш бол NotFound. */
  updateMemberRole(ctx: Ctx, orgId: string, userId: string, role: string): Promise<void>;
  /** removeMember нь гишүүнийг хасна; гишүүн биш бол NotFound. */
  removeMember(ctx: Ctx, orgId: string, userId: string): Promise<void>;
}
