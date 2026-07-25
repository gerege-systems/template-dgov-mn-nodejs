// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/users нь хэрэглэгчийн identity-ийн CRUD-ийг хариуцдаг: үүсгэх, хайх,
// идэвхжүүлэх, зөөлөн устгалт болон нууц үг эргүүлэх.
//
// Хилийн (boundary) хэлбэр: method бүр Request объект авч, (буцаах өгөгдөлтэй
// үед) Response объект буцаадаг. Ингэснээр талбар нэмэх нь дуудагчдыг эвдэхгүй —
// харин параметр нэмэх нь эвддэг.

import type { GoogleAccount, User } from '../../domain/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';

/** StoreRequest — шинэ хэрэглэгч үүсгэх оролт. */
export interface StoreRequest {
  user: User;
}
export interface StoreResponse {
  user: User;
}

export interface GetByEmailRequest {
  email: string;
}
export interface GetByEmailResponse {
  user: User;
}

export interface GetByIdRequest {
  id: string;
}
export interface GetByIdResponse {
  user: User;
}

export interface GetByNationalIdRequest {
  nationalId: string;
}
export interface GetByNationalIdResponse {
  user: User;
}

export interface UpsertFromEIDRequest {
  user: User;
}
export interface UpsertFromEIDResponse {
  user: User;
}

export interface ActivateRequest {
  userId: string;
}

export interface UpdatePasswordRequest {
  user: User;
}

export interface ListRequest {
  roleId?: number;
  activeOnly?: boolean;
  includeDeleted?: boolean;
  offset?: number;
  limit?: number;
}
export interface ListResponse {
  users: User[];
}

export interface UpdateRoleRequest {
  userId: string;
  roleId: number;
  /**
   * callerRoleId нь үйлдлийг хийж буй хэрэглэгчийн эрх — admin эрх олгох/хасахыг
   * зөвхөн super admin хийнэ (handler claim-ээс дамжуулна).
   */
  callerRoleId: number;
}

export interface SetActiveRequest {
  userId: string;
  active: boolean;
}

export interface DeleteRequest {
  userId: string;
}

/**
 * CreatePreRegisterRequest нь private платформд иргэнийг регистрийн дугаараар
 * (national_id) урьдчилан бүртгэх хүсэлт.
 */
export interface CreatePreRegisterRequest {
  /** регистрийн дугаар → national_id (жижиг үсгээр) */
  register: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  roleId: number;
  /**
   * callerRoleId нь үйлдлийг хийж буй хэрэглэгчийн эрх — admin/superadmin эрхийг
   * оноохыг зөвхөн super admin хийнэ.
   */
  callerRoleId: number;
}

/** Usecase нь оролтын хил (input boundary) юм. */
export interface UsersUsecase {
  /**
   * store нь шинэ User (нормчилсон email, hash хийсэн нууц үг) үүсгэж, хадгална;
   * DB-ийн үүсгэсэн ID-тай мөрийг буцаана.
   */
  store(ctx: Ctx, req: StoreRequest): Promise<StoreResponse>;
  /**
   * getByEmail нь өгөгдсөн email-тэй хэрэглэгчийг буцаана; кэш-эхэлсэн
   * (cache-first) хайлт бөгөөд алдалт (miss) дээр single-flight-аар нэгтгэдэг.
   */
  getByEmail(ctx: Ctx, req: GetByEmailRequest): Promise<GetByEmailResponse>;
  /** getById нь primary key-ээр хэрэглэгчийг буцаана; кэшийг алгасна. */
  getById(ctx: Ctx, req: GetByIdRequest): Promise<GetByIdResponse>;
  /** getByNationalId нь eID-ийн national_id-ээр хэрэглэгчийг буцаана; кэшийг алгасна. */
  getByNationalId(ctx: Ctx, req: GetByNationalIdRequest): Promise<GetByNationalIdResponse>;
  /** getByGoogleSub нь холбогдсон Google account (sub)-аар хэрэглэгчийг олно. */
  getByGoogleSub(ctx: Ctx, sub: string): Promise<User>;
  /** linkGoogleAccount нь Google account + профайлыг холбоно/шинэчилнэ. */
  linkGoogleAccount(ctx: Ctx, userId: string, acct: GoogleAccount): Promise<void>;
  /** unlinkGoogle нь хэрэглэгчийн Google холболтыг арилгана. */
  unlinkGoogle(ctx: Ctx, userId: string): Promise<void>;
  /** upsertFromEID нь eID identity-аас хэрэглэгчийг үүсгэх/шинэчилнэ. */
  upsertFromEID(ctx: Ctx, req: UpsertFromEIDRequest): Promise<UpsertFromEIDResponse>;
  /** activate нь хэрэглэгчийн active флагийг хувиргана. */
  activate(ctx: Ctx, req: ActivateRequest): Promise<void>;
  /**
   * updatePassword нь хэрэглэгчийн нууц үгийг (дуудагч аль хэдийн
   * domain.changePassword-аар hash хийсэн) сольж, password_changed_at-ийг
   * тэмдэглэнэ.
   */
  updatePassword(ctx: Ctx, req: UpdatePasswordRequest): Promise<void>;
  /** list нь admin удирдлагад зориулж хэрэглэгчдийг хуудаслан буцаана. */
  list(ctx: Ctx, req: ListRequest): Promise<ListResponse>;
  /** listAdmins нь админ түвшний бүх бүртгэлийг (super admin + admin) буцаана. */
  listAdmins(ctx: Ctx): Promise<ListResponse>;
  /** updateRole нь хэрэглэгчийн role-г солино (admin удирдлага). */
  updateRole(ctx: Ctx, req: UpdateRoleRequest): Promise<void>;
  /** setActive нь хэрэглэгчийг идэвхжүүлэх/идэвхгүй болгоно (admin удирдлага). */
  setActive(ctx: Ctx, req: SetActiveRequest): Promise<void>;
  /** deleteUser нь хэрэглэгчийг зөөлөн устгана (admin удирдлага). */
  deleteUser(ctx: Ctx, req: DeleteRequest): Promise<void>;
  /** createPreRegistered нь админ иргэнийг регистрийн дугаараар урьдчилан бүртгэнэ. */
  createPreRegistered(ctx: Ctx, req: CreatePreRegisterRequest): Promise<User>;
}
