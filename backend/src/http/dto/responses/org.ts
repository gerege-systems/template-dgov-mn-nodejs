// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Organization, OrganizationMembership } from '../../../domain/org.js';

/** OrgResponse нь нэг байгууллагыг клиентэд буцаана. */
export interface OrgResponse {
  id: string;
  reg_no: string;
  name: string;
  name_latin: string;
  created_by: string;
  created_at: Date;
  updated_at: Date | null;
}

export const orgResponse = (o: Organization): OrgResponse => ({
  id: o.id,
  reg_no: o.regNo,
  name: o.name,
  name_latin: o.nameLatin,
  created_by: o.createdBy,
  created_at: o.createdAt,
  updated_at: o.updatedAt,
});

export const orgListResponse = (list: Organization[]): OrgResponse[] => list.map(orgResponse);

/** OrgMemberResponse нь нэг гишүүнчлэлийг буцаана. */
export interface OrgMemberResponse {
  org_id: string;
  user_id: string;
  role: string;
  created_at: Date;
}

export const orgMemberResponse = (m: OrganizationMembership): OrgMemberResponse => ({
  org_id: m.orgId,
  user_id: m.userId,
  role: m.role,
  created_at: m.createdAt,
});

export const orgMemberListResponse = (list: OrganizationMembership[]): OrgMemberResponse[] =>
  list.map(orgMemberResponse);
