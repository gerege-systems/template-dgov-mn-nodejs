// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * SuperadminAccount нь super admin-ы бүртгэлийн satellite мөр
 * (superadmin_accounts). Super admin нь users-д role_id=1 мөр хэвээр
 * (google_sub-аар түлхүүрлэсэн, civil_id users-д NULL) боловч eID баталгаа
 * (civil_id/national_id), MFA (TOTP secret), email баталгаажуулалт,
 * урилга/onboarding metadata нь энд тусад нь хадгалагдана.
 */
export interface SuperadminAccount {
  userId: string;
  civilId: string;
  nationalId: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  /**
   * totpSecret нь AES-GCM ciphertext (usecase давхаргад шифрлэгдсэн) — DB-д ил
   * текст ХЭЗЭЭ Ч хадгалагдахгүй.
   */
  totpSecret: string;
  invitedBy: string;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * SuperadminInvite нь superadmin болох эрхтэй и-мэйлийн урилга
 * (superadmin_invites) юм — onboarding нь урилгагүй и-мэйлээр эхэлж чадахгүй
 * (allow-list). acceptedAt тэмдэглэгдсэн урилга дахин хэрэглэгдэхгүй.
 */
export interface SuperadminInvite {
  email: string;
  invitedBy: string;
  createdAt: Date;
  acceptedAt: Date | null;
}

/** inviteAccepted нь урилгыг аль хэдийн ашигласан эсэхийг мэдээлнэ. */
export const inviteAccepted = (i: SuperadminInvite): boolean => i.acceptedAt !== null;

/**
 * normalizeInviteEmail нь урилгын и-мэйлийг каноник хэлбэрт (жижиг үсэг,
 * зайгүй) буулгана — superadmin_invites.email нь primary key тул хадгалах ба
 * хайх талдаа ИЖИЛ нормчлолыг хэрэглэнэ.
 */
export const normalizeInviteEmail = (s: string): string => s.trim().toLowerCase();
