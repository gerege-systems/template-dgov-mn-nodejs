// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * Гишүүнчлэлийн (membership) дүрийн танигчид. Эдгээр нь мөр тогтмол тул DB-ийн
 * `organization_memberships.role` баганатай шууд таарна. Эрх олголтын шалгалтууд
 * эдгээр тогтмолыг ашиглах бөгөөд мөр шууд бичихгүй — нэг газар тодорхойлсноор
 * бүх дуудагч дагана.
 */
export const OrgRole = {
  /**
   * Owner нь байгууллагыг үүсгэгч. Бүх эрхтэй: гишүүн нэмэх/хасах, дүр солих.
   * Үүсгэгч автоматаар owner болно.
   */
  Owner: 'owner',
  /** Admin нь гишүүдийг удирдах эрхтэй (owner-той ойролцоо). */
  Admin: 'admin',
  /** Member нь энгийн гишүүн — байгууллагыг харна, удирдлагын эрхгүй. */
  Member: 'member',
} as const;

export type OrgRoleValue = (typeof OrgRole)[keyof typeof OrgRole];

/**
 * Organization нь байгууллагын домэйн entity. regNo нь улсын бүртгэлийн дугаар
 * (case-insensitive давтагдашгүй); nameLatin нь галиглсан нэр. createdBy нь
 * үүсгэгч — тэр автоматаар owner гишүүн болно.
 */
export interface Organization {
  id: string;
  regNo: string;
  name: string;
  nameLatin: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * OrganizationMembership нь хэрэглэгч ↔ байгууллагын холбоос бөгөөд тухайн
 * хэрэглэгчийн уг байгууллага доторх дүрийг агуулна. (orgId, userId) хосоор
 * давтагдашгүй (composite primary key).
 */
export interface OrganizationMembership {
  orgId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

/** isValidOrgRole нь өгөгдсөн дүр танигдсан эсэхийг мэдээлнэ. */
export function isValidOrgRole(role: string): boolean {
  return role === OrgRole.Owner || role === OrgRole.Admin || role === OrgRole.Member;
}

/**
 * canManageMembers нь тухайн дүр гишүүн нэмэх/хасах/дүр солих эрхтэй эсэхийг
 * мэдээлнэ. owner болон admin удирдаж чадна; энгийн member чадахгүй. Дүрэм НЭГ
 * газар байрлахын тулд функц болгосон — дуудах газруудад нүцгэн харьцуулалт
 * хийхгүй.
 */
export function canManageMembers(role: string): boolean {
  return role === OrgRole.Owner || role === OrgRole.Admin;
}
