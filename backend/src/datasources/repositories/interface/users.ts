// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Repository interface давхарга — usecase-ууд ЗӨВХӨН эдгээр гэрээнээс хамаарна,
// postgres адаптераас хэзээ ч хамаардаггүй. Ингэснээр хамаарлын чиглэл дотогш
// хэвээр үлдэж, тестүүд адаптергүйгээр mock тавьж чадна.

import type { SuperadminAccount } from '../../../domain/superadmin_account.js';
import type { GoogleAccount, User } from '../../../domain/users.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * UserListFilter нь UserRepository.list() үр дүнг нарийсгана. Талбар бүр
 * сонголттой; хоосон утга нь "энэ хэмжээст шүүлтгүй" гэсэн үг.
 */
export interface UserListFilter {
  /** 0 = аль ч role */
  roleId?: number;
  /** true = зөвхөн active=true хэрэглэгчид */
  activeOnly?: boolean;
  /** false (өгөгдмөл) = WHERE deleted_at IS NULL */
  includeDeleted?: boolean;
}

/** UserRepository нь хэрэглэгчдийг ачаалах болон хадгалах gateway юм. */
export interface UserRepository {
  /**
   * store нь хэрэглэгчийг оруулж, хадгалагдсан мөрийг нэг round-trip-д буцаадаг
   * тул дуудагчдад дараагийн getByEmail хэрэггүй. Давхардсан username/email нь
   * apperror.conflict болж гарна.
   */
  store(ctx: Ctx, input: User): Promise<User>;

  /**
   * getByEmail нь soft-delete хийгдсэн мөрүүдийг хасч, email-ээр хэрэглэгчийг
   * хайна. Тохирох мөр байхгүй үед apperror.notFound.
   */
  getByEmail(ctx: Ctx, email: string): Promise<User>;

  /**
   * getById нь soft-delete хийгдсэн мөрүүдийг хасч, primary key-ээр хэрэглэгчийг
   * хайна. Тохирох мөр байхгүй үед apperror.notFound.
   */
  getById(ctx: Ctx, id: string): Promise<User>;

  /**
   * getByGoogleSub нь холбогдсон Google account (sub)-аар хэрэглэгчийг хайна.
   * Холбоогүй бол apperror.notFound. (Google callback дахь pre-auth хайлт —
   * service RLS дор ажиллана.)
   */
  getByGoogleSub(ctx: Ctx, sub: string): Promise<User>;

  /**
   * linkGoogleAccount нь userId-тай хэрэглэгчид Google account + профайлыг
   * холбоно/шинэчилнэ. Давхардсан sub нь apperror.conflict. Анх холбосон огноог
   * (google_linked_at) нэг л удаа тэмдэглэнэ.
   */
  linkGoogleAccount(ctx: Ctx, userId: string, acct: GoogleAccount): Promise<void>;

  /** unlinkGoogle нь хэрэглэгчийн Google холболтыг (sub + профайл) арилгана. */
  unlinkGoogle(ctx: Ctx, userId: string): Promise<void>;

  /**
   * getByNationalId нь soft-delete хийгдсэн мөрүүдийг хасч, eID-ийн
   * national_id-ээр (жижиг үсгээр) хэрэглэгчийг хайна. Байхгүй бол
   * apperror.notFound.
   */
  getByNationalId(ctx: Ctx, nationalId: string): Promise<User>;

  /**
   * upsertFromEID нь eID identity-аар хэрэглэгчийг үүсгэх/шинэчлэх. civil_id аль
   * хэдийн байгаа бол нэр/kyc-г шинэчилж, идэвхжүүлж, тухайн мөрийг буцаана; эс
   * бөгөөс шинэ идэвхтэй мөр оруулна. Бүгд нэг round-trip
   * (INSERT … ON CONFLICT … RETURNING).
   */
  upsertFromEID(ctx: Ctx, input: User): Promise<User>;

  /**
   * createPreRegistered нь админ иргэнийг РЕГИСТРИЙН ДУГААР (national_id)-аар
   * урьдчилан бүртгэнэ (private платформ): national_id + нэр + role-той идэвхтэй
   * мөр (password/email/civil_id-гүй). Давхардсан national_id →
   * apperror.conflict.
   */
  createPreRegistered(ctx: Ctx, input: User): Promise<User>;

  /**
   * list нь filter-т тохирох хэрэглэгчдийг offset/limit-ээр хуудаслан буцаана.
   * Limit нь сервер талд хатуу хязгаарлагдсан тул буруу ажиллаж буй дуудагч бүх
   * хүснэгтийг татаж чадахгүй.
   */
  list(ctx: Ctx, filter: UserListFilter, offset: number, limit: number): Promise<User[]>;

  /**
   * listAdmins нь админ түвшний бүх бүртгэлийг (super admin + admin) буцаана —
   * super admin-ий "админуудыг удирдах" хуудсанд. Зэрэглэлээр (role_id өсөхөөр),
   * дараа нь шинээр үүсгэснээр эрэмбэлж, soft-delete хийгдсэнийг хасна.
   */
  listAdmins(ctx: Ctx): Promise<User[]>;

  /**
   * changeActiveUser нь active flag-г сольж, updated_at-г тэмдэглэнэ. Soft-delete
   * хийгдсэн мөрүүд дээр no-op.
   */
  changeActiveUser(ctx: Ctx, id: string, active: boolean): Promise<void>;

  /**
   * updatePassword нь bcrypt hash-г сольж, password_changed_at + updated_at-г
   * тэмдэглэнэ. Хэрэглэгч байхгүй/soft-delete хийгдсэн бол apperror.notFound.
   */
  updatePassword(ctx: Ctx, input: User): Promise<void>;

  /**
   * softDelete нь deleted_at = NOW() гэж тогтоодог тул мөр нь audit/сэргээх
   * зорилгоор хүснэгтэд хэвээр үлддэг боловч өгөгдмөл query-үүдтэй таарахаа
   * болино. Мөр байхгүй эсвэл аль хэдийн устгагдсан бол apperror.notFound.
   */
  softDelete(ctx: Ctx, id: string): Promise<void>;

  /**
   * updateRole нь хэрэглэгчийн role_id-г солино (admin удирдлага). Мөр
   * байхгүй/soft-delete хийгдсэн бол apperror.notFound; байхгүй role нь
   * apperror.badRequest.
   */
  updateRole(ctx: Ctx, id: string, roleId: number): Promise<void>;

  /** getSignature нь хэрэглэгчийн гарын үсгийн зургийг (data-URL) буцаана (хоосон бол ""). */
  getSignature(ctx: Ctx, userId: string): Promise<string>;

  /** setSignature нь гарын үсгийн зургийг тавина/шинэчилнэ; хоосон img нь устгана. */
  setSignature(ctx: Ctx, userId: string, img: string): Promise<void>;

  /** setLatinName нь латин нэрийг (first_name_en/last_name_en) гараар засна. */
  setLatinName(ctx: Ctx, userId: string, firstEn: string, lastEn: string): Promise<void>;

  /**
   * upsertSuperAdmin нь superadmin onboarding-ийн ТӨГСГӨЛД (Google + eID + email
   * OTP + TOTP бүгд баталгаажсаны дараа) super admin хэрэглэгчийг НЭГ
   * ТРАНЗАКЦИД үүсгэх/ахиулна: users мөр (google_sub-аар түлхүүрлэсэн,
   * role_id=1, civil_id/MFA НЭ) + superadmin_accounts satellite мөр.
   *
   * civil_id-г users-д ТАВИХГҮЙ тул нэг хүн eID-ээр admin, Google-оор super
   * admin байж чадна (civil_id partial unique index зөрчихгүй). totpSecret нь
   * usecase давхаргад AES-GCM-ээр шифрлэгдсэн ирнэ. Давхардсан
   * email/google_sub нь apperror.conflict. Буцаах user нь account-ийн MFA
   * утгуудаар hydrate хийгдсэн.
   */
  upsertSuperAdmin(ctx: Ctx, input: User, account: SuperadminAccount): Promise<User>;
}

/**
 * SuperadminAccountRepository нь super admin-ы satellite бүртгэлийн READ gateway
 * юм. Хүснэгт нь эмзэг тул RLS-тэй (service/admin). Бичилтийг
 * UserRepository.upsertSuperAdmin нь users мөртэй нэг транзакцид хийдэг.
 */
export interface SuperadminAccountRepository {
  /**
   * get нь user_id-аар super admin бүртгэлийг буцаана (MFA challenge-д TOTP
   * secret-ыг авах). Байхгүй бол apperror.notFound.
   */
  get(ctx: Ctx, userId: string): Promise<SuperadminAccount>;
}
