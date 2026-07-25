// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Хариуны DTO давхарга. Домэйн entity-г ХЭЗЭЭ Ч шууд JSON болгож буцаадаггүй:
// entity-д нууц үгийн hash, шифрлэгдсэн TOTP secret зэрэг клиент рүү гарах ёсгүй
// талбарууд байдаг. DTO нь илэрхий allow-list болж, "шинэ багана нэмэхэд
// санамсаргүй ил гарах" төрлийн алдааг үндсээр таслана.
//
// JSON түлхүүрүүд нь Go хувилбартай ЯГ ижил (snake_case) — клиент хөндөгдөхгүй.

import { fullName, fullNameEn, type User } from '../../../domain/users.js';

/** GoogleInfo нь холбогдсон Google account-аас хадгалсан профайл. */
export interface GoogleInfo {
  email?: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  linked_at?: Date;
}

/** EIDCertificate нь login COMPLETE-ийн cert.value (DER)-ээс задалсан хэсэг. */
export interface EIDCertificate {
  serial?: string;
  not_before?: Date;
  not_after?: Date;
  issuer?: string;
  key_type?: string;
}

/** EIDInfo нь eidmongolia.mn-ээс login үед авсан нээлттэй мэдээлэл. */
export interface EIDInfo {
  civil_id?: string;
  /** регистрийн дугаар */
  national_id?: string;
  /** сертификатын түвшин */
  kyc_level?: string;
  document_number?: string;
  certificate?: EIDCertificate;
}

export interface UserResponse {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  first_name_en: string;
  last_name_en: string;
  full_name_en: string;
  email: string;
  role_id: number;
  token?: string;
  refresh_token?: string;
  created_at: Date;
  updated_at: Date | null;
  /**
   * eid нь eID-ээр нэвтэрсэн хэрэглэгчийн identity + сертификатын мэдээлэл.
   * eID linkage-гүй хэрэглэгчид талбар огт орохгүй.
   */
  eid?: EIDInfo;
  /**
   * eid_proxy нь SSO eID proxy идэвхтэй эсэхийг заана — идэвхтэй бол иргэн локал
   * eID linkage-гүй (SSO-ээр нэвтэрсэн) байсан ч eID PKI самбарыг SSO-гоор
   * дамжуулан үзэж болно. Frontend eID хуудсуудыг үүгээр нээнэ.
   */
  eid_proxy?: boolean;
  /** google нь холбогдсон Google account-аас хадгалсан профайл. */
  google?: GoogleInfo;
}

/** omitEmpty нь хоосон мөрийг JSON-оос бүрэн хасахын тулд undefined болгоно. */
const omitEmpty = (s: string): string | undefined => (s === '' ? undefined : s);

/**
 * googleInfoOf нь Google холбогдсон (google_sub байгаа) бол GoogleInfo блок
 * үүсгэнэ; эс бөгөөс undefined (хариунд google талбар огт орохгүй).
 */
function googleInfoOf(u: User): GoogleInfo | undefined {
  if (u.googleSub === '') return undefined;
  return {
    email: omitEmpty(u.googleEmail),
    email_verified: u.googleEmailVerified,
    name: omitEmpty(u.googleName),
    picture: omitEmpty(u.googlePicture),
    linked_at: u.googleLinkedAt ?? undefined,
  };
}

/**
 * eidInfoOf нь eID identity талбар байвал EIDInfo блок үүсгэнэ; эс бөгөөс
 * undefined (eID-гүй хэрэглэгчийн хариунд eid талбар огт орохгүй).
 */
function eidInfoOf(u: User): EIDInfo | undefined {
  if (u.civilId === '' && u.nationalId === '' && u.documentNumber === '') return undefined;
  const info: EIDInfo = {
    civil_id: omitEmpty(u.civilId),
    national_id: omitEmpty(u.nationalId),
    kyc_level: omitEmpty(u.kycLevel),
    document_number: omitEmpty(u.documentNumber),
  };
  if (u.certSerial !== '' || u.certNotAfter !== null || u.certIssuer !== '') {
    info.certificate = {
      serial: omitEmpty(u.certSerial),
      not_before: u.certNotBefore ?? undefined,
      not_after: u.certNotAfter ?? undefined,
      issuer: omitEmpty(u.certIssuer),
      key_type: omitEmpty(u.certKeyType),
    };
  }
  return info;
}

/**
 * userResponseFromDomain нь хэрэглэгчийн entity-г хариуны DTO руу буулгана.
 * Токен талбарууд хоосон хэвээр үлдэнэ — entity нь auth артефакт агуулдаггүй.
 * /login болон /refresh замуудад токеныг тусад нь залгана.
 *
 * АНХААР: `password` талбар энд ХЭЗЭЭ Ч орохгүй.
 */
export function userResponseFromDomain(u: User): UserResponse {
  return {
    id: u.id,
    username: u.username,
    first_name: u.firstName,
    last_name: u.lastName,
    full_name: fullName(u),
    first_name_en: u.firstNameEn,
    last_name_en: u.lastNameEn,
    full_name_en: fullNameEn(u),
    email: u.email,
    role_id: u.roleId,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
    eid: eidInfoOf(u),
    google: googleInfoOf(u),
  };
}
