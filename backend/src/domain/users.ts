// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// domain нь enterprise entity-үүдийг агуулдаг — Clean Architecture-ийн хамгийн
// дотоод хүрээ. Гадна давхаргууд (HTTP, DB, framework) хувьсан өөрчлөгдөх үед энэ
// давхаргыг тогтвортой байлгахын тулд domain нь зөвхөн стандарт сан болон bcrypt
// (тогтвортой шифрлэлтийн primitive)-ээс хамаарна.
//
// Domain нь datasources/ эсвэл http/ модулиудыг import ХИЙХ ЁСГҮЙ — энэ нь
// хамаарлын дүрмийг урвуулна (дотоод нь гадна талаасаа хамаарах болно).
//
// Timestamp-уудыг UTC-ээр тэмдэглэдэг. Харуулах цагийн бүс нь domain-ийн биш,
// харин гадна давхаргуудын хариуцдаг танилцуулгын асуудал юм.

// bcryptjs — цэвэр JS хэрэгжилт: node-gyp/native build шаардахгүй тул Docker
// image жижиг, CI тогтвортой. $2a/$2b hash форматтай бүрэн нийцтэй учир Go
// хувилбарын үүсгэсэн одоо байгаа hash-ууд хэвээрээ шалгагдана.
import bcrypt from 'bcryptjs';

// Role-ийн танигчид. isAdmin() зэрэг эрх олголтын шийдвэрүүд нь domain логик тул
// role ID-ууд нь transport- эсвэл persistence-тэй зэргэлдээ constants биш, харин
// domain дотор байрладаг.
//
// Role ID-ууд зэрэглэлийн дарааллаар (1 = хамгийн дээд эрх). RoleSuperAdmin нь
// admin-аас дээгүүр зэрэглэлийн эрх — зөвхөн super admin админ хэрэглэгчдийг
// үүсгэх/эрх олгох/хасах боломжтой. Super admin нь admin-ийн бүх эрхийг мөн
// эдэлдэг (isAdmin() true). Энэ зэрэглэлийг API-аар үүсгэж болохгүй — зөвхөн
// bootstrap (SUPERADMIN_EMAIL) эсвэл DB-ээр л томилогдоно.
//
// АНХААР: role_id 0 нь ямар ч role БИШ — claim-гүй хуучин токенуудын sentinel
// (RBAC middleware үүнийг хамгийн бага эрх RoleUser рүү буулгадаг). Тиймээс нэг ч
// role-д 0 оноож болохгүй.
export const RoleSuperAdmin = 1;
export const RoleAdmin = 2;
export const RoleManager = 3;
export const RoleUser = 4;

// Domain алдаанууд — дуудагч нь аливаа алдааны бүрхүүлд холбогдолгүйгээр
// харьцуулж чадна. Transport давхарга эдгээрийг HTTP хэлбэрийн хариу болгож
// боодог; persistence нь DB хэлбэрийн хариу болгож боодог.
export const ErrEmptyUsername = new Error('username cannot be empty');
export const ErrEmptyEmail = new Error('email cannot be empty');
export const ErrInvalidEmail = new Error('email format is invalid');
export const ErrEmptyPassword = new Error('password cannot be empty');
/**
 * ErrEmptyCivilID нь eID identity-д иргэний бүртгэлийн дугаар (civil_id) дутуу
 * үед буцна — public RP-д IdP нь national_id-г илчилдэггүй тул civil_id нь eID
 * хэрэглэгчийн давтагдашгүй түлхүүр болдог.
 */
export const ErrEmptyCivilID = new Error('civil_id cannot be empty');

/**
 * User нь бүртгэгдсэн бүртгэлийн domain entity юм. password нь үүсгэлтийн дараа
 * үргэлж bcrypt hash-ийг агуулна — энгийн текст нь зөвхөн newUser дотор түр
 * зуур оршино.
 */
export interface User {
  id: string;
  username: string;
  /** нэр (монгол) */
  firstName: string;
  /** овог (монгол) */
  lastName: string;
  /** нэр (англи) */
  firstNameEn: string;
  /** овог (англи) */
  lastNameEn: string;
  email: string;
  password: string;
  active: boolean;
  roleId: number;
  // eID identity-ийн талбарууд. Зөвхөн eID-ээр нэвтэрсэн хэрэглэгчид бөглөгдөнө.
  /** регистрийн дугаар (улсын танигч) */
  nationalId: string;
  /** иргэний бүртгэлийн дугаар */
  civilId: string;
  /** IdP-ийн баталгаажуулалтын түвшин (сертификатын түвшин) */
  kycLevel: string;
  // eID сертификатын дэлгэрэнгүй — login COMPLETE-ийн cert.value (DER)-ээс задлагдана.
  /** төхөөрөмжийн UUID (eID) */
  documentNumber: string;
  /** сертификатын серийн дугаар */
  certSerial: string;
  /** хүчинтэй эхлэх */
  certNotBefore: Date | null;
  /** дуусах */
  certNotAfter: Date | null;
  /** олгогч CA */
  certIssuer: string;
  /** нийтийн түлхүүрийн алгоритм */
  certKeyType: string;
  /** холбогдсон Google account (sub); хоосон бол холбоогүй */
  googleSub: string;
  // Google профайл — холбогдсон account-аас хадгалсан мэдээлэл.
  googleEmail: string;
  googleEmailVerified: boolean;
  googleName: string;
  googlePicture: string;
  googleLinkedAt: Date | null;
  // MFA — superadmin onboarding-д тохируулагдана. emailVerified нь email OTP
  // баталгаажсан эсэх; mfaEnabled нь TOTP идэвхтэй эсэх; totpSecret нь AES-GCM
  // шифрлэгдсэн (usecase давхаргад шифрлэнэ/тайлна), хоосон бол 2FA-гүй.
  emailVerified: boolean;
  mfaEnabled: boolean;
  totpSecret: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  passwordChangedAt: Date | null;
}

/**
 * GoogleAccount нь Google OAuth-аас ирсэн профайл — eID хэрэглэгчид холбоход
 * (эсвэл дараагийн нэвтрэлтэд шинэчлэхэд) хадгалах талбарууд.
 */
export interface GoogleAccount {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

/** emptyUser нь бүх талбар нь тэг утгатай User-ийг буцаана. */
export function emptyUser(): User {
  return {
    id: '',
    username: '',
    firstName: '',
    lastName: '',
    firstNameEn: '',
    lastNameEn: '',
    email: '',
    password: '',
    active: false,
    roleId: 0,
    nationalId: '',
    civilId: '',
    kycLevel: '',
    documentNumber: '',
    certSerial: '',
    certNotBefore: null,
    certNotAfter: null,
    certIssuer: '',
    certKeyType: '',
    googleSub: '',
    googleEmail: '',
    googleEmailVerified: false,
    googleName: '',
    googlePicture: '',
    googleLinkedAt: null,
    emailVerified: false,
    mfaEnabled: false,
    totpSecret: '',
    createdAt: new Date(0),
    updatedAt: null,
    deletedAt: null,
    passwordChangedAt: null,
  };
}

/**
 * fullName нь монгол хэлбэрээр "Овог Нэр"-г буцаана; хоёулаа хоосон бол хоосон
 * тэмдэгт мөр (дуудагч username руу fallback хийнэ).
 */
export function fullName(u: Pick<User, 'lastName' | 'firstName'>): string {
  return `${u.lastName.trim()} ${u.firstName.trim()}`.trim();
}

/** fullNameEn нь англи (Латин) "Lastname Firstname"-г буцаана. */
export function fullNameEn(u: Pick<User, 'lastNameEn' | 'firstNameEn'>): string {
  return `${u.lastNameEn.trim()} ${u.firstNameEn.trim()}`.trim();
}

/**
 * normalizeEmail нь хоосон зайг тайрч, хаягийг жижиг үсэг болгодог тул
 * "User@Example.com " болон "user@example.com" нь ижил хайлтын key рүү hash
 * хийгдэж, ижил DB мөрийг query хийж, ижил давтагдашгүй байдлын зөрчлийг өдөөдөг.
 */
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** parseEmailAddress нь RFC 5322-ийн энгийн шалгалт (Go-ийн mail.ParseAddress). */
function isValidEmail(s: string): boolean {
  // Нэг @ тэмдэг, хоосон зайгүй, домэйнд нэг цэг — практикт хангалттай хатуу.
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
}

/** bcryptCostOrDefault нь хязгаараас гадуурх утгыг bcrypt-ийн default руу шилжүүлнэ. */
function bcryptCostOrDefault(cost: number): number {
  const MinCost = 4;
  const MaxCost = 31;
  const DefaultCost = 10;
  return cost < MinCost || cost > MaxCost ? DefaultCost : cost;
}

/**
 * newUser нь бүртгэлийн оролтоос шинэ User үүсгэнэ. Email нь нормчлогддог, нууц
 * үгийг өгөгдсөн bcrypt cost-оор hash хийдэг бөгөөд createdAt-ийг каноник цагийн
 * бүсээр тэмдэглэдэг.
 *
 * bcryptCost нь параметр (config-оос уншдаггүй) тул domain нь тохиргооны
 * асуудлуудаас ангид хэвээр үлддэг; дуудагч үүнийг inject хийдэг.
 */
export async function newUser(
  username: string,
  email: string,
  plainPassword: string,
  roleId: number,
  bcryptCost: number,
): Promise<User> {
  const name = username.trim();
  if (name === '') throw ErrEmptyUsername;
  if (plainPassword === '') throw ErrEmptyPassword;
  const mail = normalizeEmail(email);
  if (mail === '') throw ErrEmptyEmail;
  if (!isValidEmail(mail)) throw ErrInvalidEmail;

  const hash = await bcrypt.hash(plainPassword, bcryptCostOrDefault(bcryptCost));

  return {
    ...emptyUser(),
    username: name,
    email: mail,
    password: hash,
    roleId,
    createdAt: new Date(),
  };
}

/**
 * newEIDUser нь eID-ээр баталгаажсан identity-аас идэвхтэй (active=true), нууц
 * үггүй (password="") хэрэглэгч үүсгэнэ. eID хэрэглэгчид email байхгүй тул
 * enumeration-аас ангид; давтагдашгүй байдлыг civil_id-ээр хангана. username нь
 * "eid_"+civil_id (жижиг үсэг) хэлбэрийн нийлэг утга.
 *
 * АНХААР: IdP нь зөвхөн эрх бүхий auth.dgov.mn RP-д national_id (reg_no)-г
 * илчилдэг; public RP (энэ template) зөвхөн civil_id хүлээн авдаг. national_id
 * хоосон бол DB-д NULL болж хадгалагдана — эс бөгөөс partial unique index олон
 * eID хэрэглэгчийн хооронд мөргөлдөнө.
 *
 * IdP нь identity-г аль хэдийн баталгаажуулсан тул энд нууц үг hash хийдэггүй —
 * verifyPassword нь хоосон password дээр үргэлж false буцаана.
 */
export function newEIDUser(
  civilId: string,
  givenName: string,
  surname: string,
  givenNameEn: string,
  surnameEn: string,
  nationalId: string,
  kycLevel: string,
): User {
  const civil = civilId.trim().toLowerCase();
  if (civil === '') throw ErrEmptyCivilID;
  return {
    ...emptyUser(),
    username: `eid_${civil}`,
    firstName: givenName.trim(),
    lastName: surname.trim(),
    firstNameEn: givenNameEn.trim(),
    lastNameEn: surnameEn.trim(),
    email: '',
    password: '',
    active: true,
    roleId: RoleUser,
    nationalId: nationalId.trim().toLowerCase(),
    civilId: civil,
    kycLevel: kycLevel.trim(),
    createdAt: new Date(),
  };
}

/** activate нь хэрэглэгчийг идэвхтэй болгож, updatedAt-ийг тэмдэглэнэ. */
export function activate(u: User): void {
  u.active = true;
  u.updatedAt = new Date();
}

/**
 * verifyPassword нь plain нь bcrypt-ээр u.password руу hash хийгдэх тохиолдолд л
 * true буцаана. Хоосон hash дээр (passwordless eID хэрэглэгч) үргэлж false.
 */
export async function verifyPassword(u: Pick<User, 'password'>, plain: string): Promise<boolean> {
  if (u.password === '') return false;
  try {
    return await bcrypt.compare(plain, u.password);
  } catch {
    return false;
  }
}

/**
 * isAdmin нь хэрэглэгчийн role нь admin эрх олгож байгаа эсэхийг мэдээлнэ. Super
 * admin нь admin-аас дээгүүр зэрэглэл тул admin-ийн бүх эрхийг (RLS admin GUC,
 * JWT isAdmin, requirePermission bypass) мөн эдэлнэ.
 */
export function isAdmin(u: Pick<User, 'roleId'>): boolean {
  return u.roleId === RoleAdmin || u.roleId === RoleSuperAdmin;
}

/** isSuperAdmin нь хэрэглэгч super admin (админуудыг удирдах дээд эрх) эсэхийг мэдээлнэ. */
export function isSuperAdmin(u: Pick<User, 'roleId'>): boolean {
  return u.roleId === RoleSuperAdmin;
}

/**
 * changePassword нь plain-ийг өгөгдсөн bcrypt cost-оор hash хийж, хадгалсан
 * hash-ийг сольж, passwordChangedAt + updatedAt-ийг тэмдэглэнэ. Энэ timestamp нь
 * хүчингүй болгох (revocation) тасалбар цэг юм: түүнээс өмнө олгогдсон
 * токенуудыг /refresh дээр татгалзана.
 */
export async function changePassword(u: User, plain: string, bcryptCost: number): Promise<void> {
  if (plain === '') throw ErrEmptyPassword;
  const hash = await bcrypt.hash(plain, bcryptCostOrDefault(bcryptCost));
  const now = new Date();
  u.password = hash;
  u.passwordChangedAt = now;
  u.updatedAt = now;
}

/**
 * tokensRevokedBefore нь access/refresh токенуудын тасалбар timestamp-ийг
 * буцаана. iat нь энэ timestamp-аас өмнө байгаа токенуудыг татгалзах ёстой. null
 * нь "хүчингүй болгох тасалбар байхгүй" гэсэн утгатай.
 */
export function tokensRevokedBefore(u: Pick<User, 'passwordChangedAt'>): Date | null {
  return u.passwordChangedAt;
}
