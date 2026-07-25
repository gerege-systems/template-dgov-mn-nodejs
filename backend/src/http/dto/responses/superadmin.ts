// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { SuperadminInvite } from '../../../domain/superadmin_account.js';
import { fullName, fullNameEn } from '../../../domain/users.js';
import type { User } from '../../../domain/users.js';

/**
 * AdminUserResponse нь админ удирдлагын жагсаалтын мөр. UserResponse-оос
 * ялгаатай нь `active` статусыг агуулна (token талбаргүй).
 */
export interface AdminUserResponse {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  full_name_en: string;
  email: string;
  role_id: number;
  active: boolean;
  created_at: string;
  updated_at: string | null;
}

export const adminUserResponse = (u: User): AdminUserResponse => ({
  id: u.id,
  username: u.username,
  first_name: u.firstName,
  last_name: u.lastName,
  full_name: fullName(u),
  full_name_en: fullNameEn(u),
  email: u.email,
  role_id: u.roleId,
  active: u.active,
  created_at: u.createdAt.toISOString(),
  updated_at: u.updatedAt ? u.updatedAt.toISOString() : null,
});

export const adminUserListResponse = (list: User[]): AdminUserResponse[] =>
  list.map(adminUserResponse);

/** SuperadminInviteResponse нь super admin болох урилгын мөр. */
export interface SuperadminInviteResponse {
  email: string;
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
}

export const superadminInviteResponse = (i: SuperadminInvite): SuperadminInviteResponse => ({
  email: i.email,
  invited_by: i.invitedBy,
  created_at: i.createdAt.toISOString(),
  accepted_at: i.acceptedAt ? i.acceptedAt.toISOString() : null,
});

export const superadminInviteListResponse = (
  list: SuperadminInvite[],
): SuperadminInviteResponse[] => list.map(superadminInviteResponse);
