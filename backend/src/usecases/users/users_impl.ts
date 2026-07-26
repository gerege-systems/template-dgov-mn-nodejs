// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// users usecase-ийн хэрэгжилт. Энэ нь auth-тай холбоотой ямар нэг хамтрагчаас
// (JWT, Redis, OTP verifier) хамаардаггүй — энэ нь User vs Auth хуваагдлын гол
// утга юм.

import { badRequest, DomainError, forbidden, internalCause } from '../../apperror/index.js';
import { SingleFlight, type MemoryCache } from '../../datasources/caches/memory.js';
import type { UserRepository } from '../../datasources/repositories/interface/users.js';
import {
  emptyUser,
  ErrEmptyEmail,
  ErrEmptyPassword,
  ErrEmptyUsername,
  ErrInvalidEmail,
  isSuperAdmin,
  newUser,
  normalizeEmail,
  RoleAdmin,
  RoleSuperAdmin,
  RoleUser,
  type GoogleAccount,
  type User,
} from '../../domain/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import { observeCacheOp } from '../../pkg/observability/metrics.js';
import type {
  ActivateRequest,
  CreatePreRegisterRequest,
  DeleteRequest,
  GetByEmailRequest,
  GetByEmailResponse,
  GetByIdRequest,
  GetByIdResponse,
  GetByNationalIdRequest,
  GetByNationalIdResponse,
  ListRequest,
  ListResponse,
  SetActiveRequest,
  StoreRequest,
  StoreResponse,
  UpdatePasswordRequest,
  UpdateRoleRequest,
  UpsertFromEIDRequest,
  UpsertFromEIDResponse,
  UsersUsecase,
} from './users_usecase.js';

/**
 * Config нь usecase-ийн domain давхарга руу дамжуулдаг тохируулах боломжтой
 * утгуудыг агуулна. Domain өөрөө bcryptCost-ийг параметрээр авдаг тул тохиргооны
 * асуудлуудаас ангид хэвээр үлдэж чадна; usecase нь config-ийн талаар мэддэг хил юм.
 */
export interface UsersConfig {
  bcryptCost: number;
}

const usecaseName = 'users';
const fileName = 'users_impl.ts';

/** cacheKeyForEmail нь email-ээр түлхүүрлэгдсэн кэшийн нэгдсэн түлхүүр. */
const cacheKeyForEmail = (email: string): string => `user/${email}`;

/**
 * mapRepoError нь repository-ээс буцсан DomainError-уудыг ХАДГАЛЖ, харин түүхий
 * алдаануудыг форматтай дотоод алдаагаар боодог. Үүнгүйгээр дээд урсгал дахь
 * төрлийн шалгалт амжилтгүй болж, 404 нь 500 болж хувирна (эсвэл эсрэгээр).
 */
function mapRepoError(err: unknown, op: string): unknown {
  if (err instanceof DomainError) return err;
  return internalCause(new Error(`${op}: ${logger.errText(err)}`));
}

class UsersUsecaseImpl implements UsersUsecase {
  /**
   * userByEmailGroup нь ижил email-ийн зэрэгцээ кэш алдалтуудыг нэгтгэдэг тул
   * олон зэрэг хүсэлт (thundering herd) N зэрэгцээ DB дуудлага болон тархахгүй.
   */
  private readonly userByEmailGroup = new SingleFlight<User>();

  constructor(
    private readonly repo: UserRepository,
    private readonly cache: MemoryCache,
    private readonly cfg: UsersConfig,
  ) {}

  // ──────────────────────────────── Store ────────────────────────────────

  /**
   * store нь шинэ User (email-ийг нормчилж, нууц үгийг hash хийж, createdAt-ийг
   * тэмдэглэдэг — бүгд нэг газар) үүсгэж, оруулна. Repo-гийн INSERT … RETURNING
   * нь хадгалсан мөрийг нэг round-trip-д өгдөг.
   *
   * req.user-ийг бүртгэлийн талбаруудын DTO гэж үздэгийг анхаар; бид түүний
   * hash/createdAt-д итгэдэггүй — domain.newUser нь хүчинтэй User үүсгэдэг
   * цорын ганц зам юм.
   */
  async store(ctx: Ctx, req: StoreRequest): Promise<StoreResponse> {
    const inp = req.user;
    logger.infoWithContext(ctx, 'Upper store', {
      usecase: usecaseName,
      method: 'store',
      file: fileName,
      request: { username: inp.username, email: inp.email, role_id: inp.roleId },
    });

    let user: User;
    try {
      user = await newUser(inp.username, inp.email, inp.password, inp.roleId, this.cfg.bcryptCost);
    } catch (buildErr) {
      // Domain-ийн баталгаажуулалтын алдаанууд (хоосон талбарууд) нь хэрэглэгчид
      // харагдах төрлийнх — тэдгээрийг BadRequest болгож гаргана. Бусад зүйл
      // (жишээ нь bcrypt-ийн алдаа) нь дотоод гэмтэл юм.
      const userFacing =
        buildErr === ErrEmptyUsername ||
        buildErr === ErrEmptyEmail ||
        buildErr === ErrInvalidEmail ||
        buildErr === ErrEmptyPassword;
      logger.errorWithContext(ctx, 'Store user failed: build error', {
        usecase: usecaseName,
        method: 'store',
        file: fileName,
        step: 'domain_new_user',
        error: logger.errText(buildErr),
        email: inp.email,
      });
      throw userFacing
        ? badRequest(logger.errText(buildErr))
        : internalCause(new Error(`build user: ${logger.errText(buildErr)}`));
    }

    // newUser нь identity/нууц үгийг л барьдаг тул овог/нэрийг (мн+en) энд хуулна.
    user.firstName = inp.firstName;
    user.lastName = inp.lastName;
    user.firstNameEn = inp.firstNameEn;
    user.lastNameEn = inp.lastNameEn;

    try {
      const stored = await this.repo.store(ctx, user);
      return { user: stored };
    } catch (repoErr) {
      logger.errorWithContext(ctx, 'Store user failed: repository error', {
        usecase: usecaseName,
        method: 'store',
        file: fileName,
        step: 'repo_store',
        error: logger.errText(repoErr),
        email: user.email,
      });
      throw mapRepoError(repoErr, 'store user');
    }
  }

  // ─────────────────────────────── Read paths ───────────────────────────────

  /**
   * getByEmail нь өгөгдсөн email-тэй хэрэглэгчийг буцаана. Эхлээд процессийн
   * дотоод кэшийг шалгана; алдалт (miss) дээр зэрэгцээ хүсэлтүүд Postgres руу
   * олон зэрэг очихоос сэргийлж single-flight-аар нэг DB алхамыг хуваалцана.
   */
  async getByEmail(ctx: Ctx, req: GetByEmailRequest): Promise<GetByEmailResponse> {
    const email = normalizeEmail(req.email);
    const cacheKey = cacheKeyForEmail(email);

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      observeCacheOp('memory', 'get', 'hit');
      return { user: cached as User };
    }
    observeCacheOp('memory', 'get', 'miss');

    try {
      const user = await this.userByEmailGroup.do(email, async () => {
        const found = await this.repo.getByEmail(ctx, email);
        this.cache.set(cacheKey, found);
        observeCacheOp('memory', 'set', 'ok');
        return found;
      });
      return { user };
    } catch (err) {
      // Дэд бүтцийн алдаанууд 404 мэт харагдахгүйн тулд төрөлжсөн алдаануудыг дамжуулна.
      logger.errorWithContext(ctx, 'Get user by email failed: repository error', {
        usecase: usecaseName,
        method: 'getByEmail',
        file: fileName,
        step: 'repo_get_by_email',
        error: logger.errText(err),
        email,
      });
      throw mapRepoError(err, 'get user by email');
    }
  }

  /**
   * getById нь primary key-ээр хэрэглэгчийг буцаана. ID-аар хайх нь email-ээр
   * түлхүүрлэгдсэн кэшээр дамждаггүй — ID-аар кэшлэх нь хэмжигдэх hit rate-гүйгээр
   * төлөвийг давхардуулах болно.
   */
  async getById(ctx: Ctx, req: GetByIdRequest): Promise<GetByIdResponse> {
    try {
      return { user: await this.repo.getById(ctx, req.id) };
    } catch (err) {
      throw mapRepoError(err, 'get user by id');
    }
  }

  /** getByNationalId нь eID-ийн national_id-ээр хэрэглэгчийг буцаана; кэшийг алгасна. */
  async getByNationalId(ctx: Ctx, req: GetByNationalIdRequest): Promise<GetByNationalIdResponse> {
    try {
      return { user: await this.repo.getByNationalId(ctx, req.nationalId) };
    } catch (err) {
      throw mapRepoError(err, 'get user by national_id');
    }
  }

  // ──────────────────────────────── Google ────────────────────────────────

  async getByGoogleSub(ctx: Ctx, sub: string): Promise<User> {
    return this.repo.getByGoogleSub(ctx, sub);
  }

  async linkGoogleAccount(ctx: Ctx, userId: string, acct: GoogleAccount): Promise<void> {
    await this.repo.linkGoogleAccount(ctx, userId, acct);
  }

  async unlinkGoogle(ctx: Ctx, userId: string): Promise<void> {
    await this.repo.unlinkGoogle(ctx, userId);
  }

  // ────────────────────────────────── eID ──────────────────────────────────

  /**
   * upsertFromEID нь eID identity-аас (domain.newEIDUser-ээр бүтээгдсэн)
   * хэрэглэгчийг repository-ийн ON CONFLICT upsert-ээр үүсгэх/шинэчилнэ.
   */
  async upsertFromEID(ctx: Ctx, req: UpsertFromEIDRequest): Promise<UpsertFromEIDResponse> {
    try {
      return { user: await this.repo.upsertFromEID(ctx, req.user) };
    } catch (err) {
      throw mapRepoError(err, 'upsert eid user');
    }
  }

  // ──────────────────────────── State transitions ────────────────────────────

  /**
   * activate нь хэрэглэгчийн active флагийг хувиргана — цорын ганц зүй ёсны
   * дуудагч нь auth context-ийн OTP баталгаажуулах урсгал юм. `active`-ийг
   * хувиргах нь юу өдөөснөөс үл хамааран хэрэглэгчийн бичлэг дээрх үйлдэл тул энэ
   * нь Auth-д биш, User bounded context-д байрладаг.
   */
  async activate(ctx: Ctx, req: ActivateRequest): Promise<void> {
    try {
      await this.repo.changeActiveUser(ctx, req.userId, true);
    } catch (err) {
      throw internalCause(new Error(`activate user: ${logger.errText(err)}`));
    }
    // Дараагийн Login нь OTP урсгалын үед getByEmail-ийн бөглөсөн хуучирсан
    // (active=false) бичлэгийг уншихгүйн тулд кэшийг хүчингүй болгоно. Уншилт
    // нурвал алгасна — кэш цэвэрлэх нь тус нэмэр, гол үйлдлийг унагах шалтгаан
    // биш (кэшийн TTL нь эцсийн аюулгүйн сүлжээ).
    const email = await this.emailForCacheKey(ctx, req.userId);
    if (email !== '') this.cache.del(cacheKeyForEmail(email));
  }

  /**
   * updatePassword нь аль хэдийн hash хийсэн нууц үг + хүчингүй болгох
   * timestamp-ийг хадгална. Дуудагч эхлээд domain.changePassword-ийг дуудна гэж
   * тооцдог (password + passwordChangedAt + updatedAt бөглөгдсөн байх ёстой).
   */
  async updatePassword(ctx: Ctx, req: UpdatePasswordRequest): Promise<void> {
    if (req.user.id === '') throw badRequest('user id required');
    try {
      await this.repo.updatePassword(ctx, req.user);
    } catch (err) {
      throw mapRepoError(err, `update password for ${req.user.id}`);
    }
    // Дараагийн Login нь хуучин hash-тай кэшлэгдсэн хэрэглэгчийг уншихгүйн тулд
    // email-ээр түлхүүрлэгдсэн бичлэгийг хүчингүй болгоно.
    let email = req.user.email;
    if (email === '') email = await this.emailForCacheKey(ctx, req.user.id);
    if (email !== '') this.cache.del(cacheKeyForEmail(email));
  }

  /**
   * emailForCacheKey нь кэш цэвэрлэхэд хэрэгтэй email-ийг олно. Уншилт нурвал
   * ХАЯХГҮЙ, хоосон мөр буцаана — кэш цэвэрлэх нь тус нэмэр, гол үйлдлийг унагах
   * шалтгаан биш.
   */
  private async emailForCacheKey(ctx: Ctx, userId: string): Promise<string> {
    try {
      return (await this.repo.getById(ctx, userId)).email;
    } catch {
      return '';
    }
  }

  // ──────────────────────────── Admin management ────────────────────────────

  /** list нь хэрэглэгчдийг хуудаслан буцаана. Кэш ашиглахгүй — admin шинэ өгөгдөл харна. */
  async list(ctx: Ctx, req: ListRequest): Promise<ListResponse> {
    try {
      const users = await this.repo.list(
        ctx,
        {
          roleId: req.roleId ?? 0,
          activeOnly: req.activeOnly ?? false,
          includeDeleted: req.includeDeleted ?? false,
        },
        req.offset ?? 0,
        req.limit ?? 0,
      );
      return { users };
    } catch (err) {
      throw mapRepoError(err, 'list users');
    }
  }

  /** listAdmins нь админ түвшний бүх бүртгэлийг буцаана. Кэш ашиглахгүй. */
  async listAdmins(ctx: Ctx): Promise<ListResponse> {
    try {
      return { users: await this.repo.listAdmins(ctx) };
    } catch (err) {
      throw mapRepoError(err, 'list admins');
    }
  }

  /**
   * updateRole нь хэрэглэгчийн role-г солино. Эхлээд getById-ээр оршихыг шалгаж,
   * email-ийг авч (кэш цэвэрлэхэд) дараа нь role-г шинэчилнэ.
   *
   * Хамгаалалт (privilege-escalation): super admin зэрэглэлийг энэ замаар ХЭЗЭЭ Ч
   * оноож болохгүй (зөвхөн bootstrap/DB), мөн super admin бүртгэлийг энэ замаар
   * өөрчилж болохгүй — эс бөгөөс users.manage эрхтэй энгийн admin өөр бүртгэлийг
   * super admin болгож эрх нэмэгдүүлэх, эсвэл super admin-г буулгах боломжтой болно.
   *
   * Мөн ADMIN эрхийг зөвхөн super admin олгож/хасна: энгийн admin нь зөвхөн
   * manager ↔ user хооронд л сольж чадна.
   */
  async updateRole(ctx: Ctx, req: UpdateRoleRequest): Promise<void> {
    if (req.roleId === RoleSuperAdmin) throw forbidden('cannot assign the super admin role');

    let existing: User;
    try {
      existing = await this.repo.getById(ctx, req.userId);
    } catch (err) {
      throw mapRepoError(err, 'get user by id');
    }
    if (isSuperAdmin(existing)) throw forbidden('cannot modify a super admin account');

    if (req.callerRoleId !== RoleSuperAdmin) {
      if (req.roleId === RoleAdmin) {
        throw forbidden('only a super admin can grant the admin role');
      }
      if (existing.roleId === RoleAdmin) {
        throw forbidden('only a super admin can change an admin account');
      }
    }

    try {
      await this.repo.updateRole(ctx, req.userId, req.roleId);
    } catch (err) {
      throw mapRepoError(err, 'update role');
    }
    this.cache.del(cacheKeyForEmail(existing.email));
  }

  /**
   * createPreRegistered нь private платформд иргэнийг регистрийн дугаараар
   * урьдчилан бүртгэнэ. Эрхийн хамгаалалт нь updateRole-той ижил.
   */
  async createPreRegistered(ctx: Ctx, req: CreatePreRegisterRequest): Promise<User> {
    if (req.roleId === RoleSuperAdmin) throw forbidden('cannot assign the super admin role');
    if (req.callerRoleId !== RoleSuperAdmin && req.roleId === RoleAdmin) {
      throw forbidden('only a super admin can grant the admin role');
    }
    const roleId = req.roleId === 0 ? RoleUser : req.roleId;

    // Регистрийн дугаарыг eID-ийн адил жижиг үсгээр — SSO upsert нь
    // lower(national_id)-аар тааруулдаг тул тохирно.
    const natId = req.register.trim().toLowerCase();
    if (natId === '') throw badRequest('регистрийн дугаар шаардлагатай');

    const user: User = {
      ...emptyUser(),
      username: `reg_${natId}`,
      firstName: req.firstName.trim(),
      lastName: req.lastName.trim(),
      firstNameEn: req.firstNameEn.trim(),
      lastNameEn: req.lastNameEn.trim(),
      nationalId: natId,
      roleId,
      active: true,
    };

    try {
      return await this.repo.createPreRegistered(ctx, user);
    } catch (err) {
      throw mapRepoError(err, 'pre-register user');
    }
  }

  /**
   * setActive нь хэрэглэгчийг идэвхжүүлэх/идэвхгүй болгоно. Super admin
   * бүртгэлийг энэ замаар идэвхгүй болгож болохгүй.
   */
  async setActive(ctx: Ctx, req: SetActiveRequest): Promise<void> {
    let existing: User;
    try {
      existing = await this.repo.getById(ctx, req.userId);
    } catch (err) {
      throw mapRepoError(err, 'get user by id');
    }
    if (isSuperAdmin(existing)) throw forbidden('cannot modify a super admin account');

    try {
      await this.repo.changeActiveUser(ctx, req.userId, req.active);
    } catch (err) {
      throw mapRepoError(err, 'set active');
    }
    this.cache.del(cacheKeyForEmail(existing.email));
  }

  /** deleteUser нь хэрэглэгчийг зөөлөн устгана. Super admin бүртгэлийг устгаж болохгүй. */
  async deleteUser(ctx: Ctx, req: DeleteRequest): Promise<void> {
    let existing: User;
    try {
      existing = await this.repo.getById(ctx, req.userId);
    } catch (err) {
      throw mapRepoError(err, 'get user by id');
    }
    if (isSuperAdmin(existing)) throw forbidden('cannot modify a super admin account');

    try {
      await this.repo.softDelete(ctx, req.userId);
    } catch (err) {
      throw mapRepoError(err, 'soft delete');
    }
    this.cache.del(cacheKeyForEmail(existing.email));
  }
}

/** newUsersUsecase нь User CRUD use case-ийг үүсгэнэ. */
export function newUsersUsecase(
  repo: UserRepository,
  cache: MemoryCache,
  cfg: UsersConfig,
): UsersUsecase {
  return new UsersUsecaseImpl(repo, cache, cfg);
}
