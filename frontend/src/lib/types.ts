// Backend-ийн REST API-тай нийцсэн хуваалцсан типүүд.
// Эх сурвалж: docs/API_CONTRACT_MN.md болон responses.users.go.

/** Бүх backend хариу ороодог дугтуй (envelope). */
export interface Envelope<T = unknown> {
  status: boolean;
  message?: string;
  data?: T;
  request_id?: string;
}

/** responses.UserResponse — /login ба /refresh дээр токентой, /users/me дээр токенгүй. */
export interface BackendUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  first_name_en?: string;
  last_name_en?: string;
  full_name_en?: string;
  email: string;
  role_id: number;
  token?: string;
  refresh_token?: string;
  created_at: string;
  updated_at: string | null;
  eid?: BackendEID;
  eid_proxy?: boolean;
  google?: BackendGoogle;
}

/** Холбогдсон Google account-аас хадгалсан профайл (backend JSON). */
export interface BackendGoogle {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  linked_at?: string | null;
}

/** eidmongolia.mn-ээс login үед авсан identity + сертификатын мэдээлэл. */
export interface BackendEID {
  civil_id?: string;
  national_id?: string;
  kyc_level?: string;
  document_number?: string;
  certificate?: {
    serial?: string;
    not_before?: string;
    not_after?: string;
    issuer?: string;
    key_type?: string;
  };
}

/** SessionUser дээрх Google профайл (camelCase). */
export interface GoogleInfo {
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
  linkedAt: string | null;
}

/** SessionUser дээрх eID мэдээлэл (camelCase). */
export interface EIDInfo {
  civilId: string;
  nationalId: string;
  kycLevel: string;
  documentNumber: string;
  certificate?: {
    serial: string;
    notBefore: string | null;
    notAfter: string | null;
    issuer: string;
    keyType: string;
  };
}

/** GET /users/me нь өгөгдлийг { user: ... } дотор савладаг. */
export interface MeData {
  user: BackendUser;
}

/** 422 validation алдааны үед data.errors талбар бүрээр ирнэ. */
export interface ValidationData {
  errors: Record<string, string>;
}

/** Frontend-д ашиглах цэвэрлэсэн хэрэглэгчийн дүрс. */
export interface SessionUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;     // монгол "Овог Нэр" (хоосон бол username)
  firstNameEn: string;
  lastNameEn: string;
  fullNameEn: string;   // англи "Lastname Firstname" (хоосон байж болно)
  email: string;
  roleId: number;
  createdAt: string;
  updatedAt: string | null;
  eid?: EIDInfo;
  /** SSO eID proxy идэвхтэй — локал eID linkage-гүй ч eID хуудсуудыг нээнэ. */
  eidProxy?: boolean;
  google?: GoogleInfo;
}

/** Овог Нэр; хоосон бол username руу fallback. */
export function fullNameOf(u: { firstName?: string; lastName?: string; full_name?: string; username: string }): string {
  const composed = `${u.lastName ?? ''} ${u.firstName ?? ''}`.trim();
  return (u.full_name?.trim() || composed) || u.username;
}

/** Одоогийн хэлээр харуулах нэр: en үед англи нэр (байхгүй бол монгол/username). */
export function displayName(u: { fullName: string; fullNameEn?: string; username: string }, lang: 'mn' | 'en'): string {
  if (lang === 'en') return u.fullNameEn?.trim() || u.fullName || u.username;
  return u.fullName || u.username;
}

export function toSessionUser(u: BackendUser): SessionUser {
  const firstName = u.first_name ?? '';
  const lastName = u.last_name ?? '';
  const firstNameEn = u.first_name_en ?? '';
  const lastNameEn = u.last_name_en ?? '';
  return {
    id: u.id,
    username: u.username,
    firstName,
    lastName,
    fullName: fullNameOf({ firstName, lastName, full_name: u.full_name, username: u.username }),
    firstNameEn,
    lastNameEn,
    fullNameEn: (u.full_name_en?.trim() || `${lastNameEn} ${firstNameEn}`.trim()),
    email: u.email,
    roleId: u.role_id,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    eid: u.eid ? toEIDInfo(u.eid) : undefined,
    eidProxy: u.eid_proxy ?? false,
    google: u.google ? toGoogleInfo(u.google) : undefined,
  };
}

/** Backend google блокийг camelCase SessionUser хэлбэрт буулгана. */
function toGoogleInfo(g: BackendGoogle): GoogleInfo {
  return {
    email: g.email ?? '',
    emailVerified: g.email_verified ?? false,
    name: g.name ?? '',
    picture: g.picture ?? '',
    linkedAt: g.linked_at ?? null,
  };
}

/** Backend eID блокийг camelCase SessionUser хэлбэрт буулгана. */
function toEIDInfo(e: BackendEID): EIDInfo {
  return {
    civilId: e.civil_id ?? '',
    nationalId: e.national_id ?? '',
    kycLevel: e.kyc_level ?? '',
    documentNumber: e.document_number ?? '',
    certificate: e.certificate
      ? {
          serial: e.certificate.serial ?? '',
          notBefore: e.certificate.not_before ?? null,
          notAfter: e.certificate.not_after ?? null,
          issuer: e.certificate.issuer ?? '',
          keyType: e.certificate.key_type ?? '',
        }
      : undefined,
  };
}

/**
 * Role ID тогтмолууд — backend-ийн domain.Role* -тэй таарна (id 1 = хамгийн
 * дээд эрх): superadmin=1, admin=2, manager=3, user=4.
 */
export const ROLE_SUPERADMIN = 1;
export const ROLE_ADMIN = 2;
export const ROLE_MANAGER = 3;
export const ROLE_USER = 4;

/** Хэрэглэгч super admin эсэх (админуудыг удирдах дээд эрх). */
export function isSuperAdmin(roleId: number): boolean {
  return roleId === ROLE_SUPERADMIN;
}

/** Хэрэглэгч админ түвшний эсэх (super admin эсвэл admin). */
export function isAdminLevel(roleId: number): boolean {
  return roleId === ROLE_SUPERADMIN || roleId === ROLE_ADMIN;
}

/** role_id → хүний унших нэр. */
export function roleLabel(roleId: number, lang: 'mn' | 'en' = 'mn'): string {
  const mn: Record<number, string> = { 1: 'Супер админ', 2: 'Админ', 3: 'Менежер', 4: 'Хэрэглэгч' };
  const en: Record<number, string> = { 1: 'Superadmin', 2: 'Admin', 3: 'Manager', 4: 'User' };
  return (lang === 'en' ? en : mn)[roleId] ?? (lang === 'en' ? 'User' : 'Хэрэглэгч');
}
