// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// records нь DB-ийн мөрийн ил дүрслэл юм. Талбарын нэрс нь баганы нэртэй ЯГ
// таарна (snake_case) — node-postgres нь мөрийг тэр нэрсээр объект болгож
// буцаадаг тул нэмэлт mapper давхарга шаардахгүй.
//
// Nullable багануудыг `| null`-ээр илэрхийлсэн тул SQL NULL нь домэйн руу
// буулгахад хоосон мөр/undefined болж хувирна.

import type { User } from '../../domain/users.js';
import { emptyUser } from '../../domain/users.js';

/**
 * UsersRecord нь users хүснэгтийн мөр юм.
 *
 * GORM/ORM-ийн автомат soft-delete БАЙХГҮЙ тул repository давхарга нь
 * `deleted_at IS NULL`-г query бүрт ИЛ-ээр нэмэх ёстой.
 *
 * email_verified / mfa_enabled / totp_secret нь super admin-ы бүртгэлийн дата
 * тул superadmin_accounts хүснэгтэд шилжсэн (migration 37) — энд БАЙХГҮЙ.
 */
export interface UsersRecord {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  first_name_en: string;
  last_name_en: string;
  // email/password нь eID хэрэглэгчдэд NULL байж болно (migration 12-д NOT NULL
  // хасагдсан).
  email: string | null;
  password: string | null;
  active: boolean;
  role_id: number;
  // eID identity баганууд (migration 12) — нууц үгээр бүртгүүлсэн хэрэглэгчдэд NULL.
  national_id: string | null;
  civil_id: string | null;
  kyc_level: string | null;
  document_number: string | null;
  cert_serial: string | null;
  cert_not_before: Date | null;
  cert_not_after: Date | null;
  cert_issuer: string | null;
  cert_key_type: string | null;
  google_sub: string | null;
  google_email: string | null;
  google_email_verified: boolean;
  google_name: string | null;
  google_picture: string | null;
  google_linked_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
  deleted_at: Date | null;
  password_changed_at: Date | null;
}

/**
 * UserColumns нь SELECT/RETURNING-д ашиглах баганануудын жагсаалт — query-уудыг
 * тогтвортой байлгахаар нэг эх сурвалжид төвлөрүүлэв.
 */
export const UserColumns =
  'id, username, first_name, last_name, first_name_en, last_name_en, email, password, active, role_id, ' +
  'national_id, civil_id, kyc_level, document_number, cert_serial, cert_not_before, cert_not_after, ' +
  'cert_issuer, cert_key_type, google_sub, google_email, google_email_verified, google_name, ' +
  'google_picture, google_linked_at, created_at, updated_at, deleted_at, password_changed_at';

/** derefStr нь nullable баганыг домэйний string руу буулгана — NULL → "". */
const derefStr = (s: string | null | undefined): string => s ?? '';

/**
 * ptrOrNil нь хоосон мөрийг SQL NULL болгоно — eID хэрэглэгчийн хоосон
 * email/password-ийг NULL-ээр хадгалахад. Хоосон мөрийг NULL болгохгүй бол
 * lower(national_id) зэрэг partial unique index олон хэрэглэгчид мөргөлдөнө.
 */
export const ptrOrNil = (s: string | null | undefined): string | null =>
  s === undefined || s === null || s === '' ? null : s;

/** userRecordToDomain нь DB мөрийг домэйн entity болгоно. */
export function userRecordToDomain(u: UsersRecord): User {
  return {
    ...emptyUser(),
    id: u.id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    firstNameEn: u.first_name_en,
    lastNameEn: u.last_name_en,
    email: derefStr(u.email),
    password: derefStr(u.password),
    active: u.active,
    roleId: u.role_id,
    nationalId: derefStr(u.national_id),
    civilId: derefStr(u.civil_id),
    kycLevel: derefStr(u.kyc_level),
    documentNumber: derefStr(u.document_number),
    certSerial: derefStr(u.cert_serial),
    certNotBefore: u.cert_not_before,
    certNotAfter: u.cert_not_after,
    certIssuer: derefStr(u.cert_issuer),
    certKeyType: derefStr(u.cert_key_type),
    googleSub: derefStr(u.google_sub),
    googleEmail: derefStr(u.google_email),
    googleEmailVerified: u.google_email_verified,
    googleName: derefStr(u.google_name),
    googlePicture: derefStr(u.google_picture),
    googleLinkedAt: u.google_linked_at,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    deletedAt: u.deleted_at,
    passwordChangedAt: u.password_changed_at,
  };
}

/** usersToDomain нь мөрийн массивыг домэйн массив болгоно. */
export const usersToDomain = (rows: UsersRecord[]): User[] => rows.map(userRecordToDomain);
