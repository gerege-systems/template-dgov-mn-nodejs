// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// users хүснэгтийн postgres адаптер. ORM БАЙХГҮЙ — SQL нь гараар бичигдэж,
// утгууд нь ЗӨВХӨН $N parameter-ээр холбогддог (хэзээ ч мөр рүү залгагддаггүй).
//
// ORM-ийн автомат soft-delete байхгүй тул query бүр `deleted_at IS NULL`-г
// ИЛ-ээр нэмдэг.
//
// БҮХ уншилт/бичилт `db.withRLS(...)`-ийн дор явна: тэр нь транзакц онгойлгож,
// `app.user_id` / `app.user_role` GUC-уудыг `set_config(..., true)`-ээр тавьдаг
// (SET LOCAL семантик) тул identity нь pooled холболтоор алдагдахгүй. Контекстэд
// identity байхгүй бол GUC хоосон болж RLS бодлого бүх мөрийг ХААНА (fail-closed).
//
// Go хувилбар нь query тус бүрийг өөрийн файлд (users_store.go, users_eid.go …)
// тавьдаг — Go-д method-уудыг файл хооронд тараах боломжтой. TypeScript-ийн class
// тийм биш тул энд НЭГ class дотор хэсэглэн бичив; хэсгүүдийн дараалал Go-ийн
// файлуудыг дагана.

import {
  conflict,
  DomainError,
  badRequest,
  internalCause,
  notFound,
} from '../../../../apperror/index.js';
import {
  RoleAdmin,
  RoleSuperAdmin,
  type GoogleAccount,
  type User,
} from '../../../../domain/users.js';
import type { SuperadminAccount } from '../../../../domain/superadmin_account.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import * as logger from '../../../../pkg/logger/logger.js';
import {
  PgForeignKeyViolation,
  isUniqueViolation,
  pgErrorCode,
  type Db,
  type Queryable,
} from '../../../drivers/pg.js';
import {
  UserColumns,
  ptrOrNil,
  userRecordToDomain,
  usersToDomain,
  type UsersRecord,
} from '../../../records/users.js';
import type { UserListFilter, UserRepository } from '../../interface/users.js';

const repositoryName = 'users';
const fileName = 'users_postgres.ts';

/** hardLimit нь list хуудасны хэмжээг хязгаарлана — бүх хүснэгтийг татахаас сэргийлнэ. */
const hardLimit = 200;

/** logFields нь repository логийн нийтлэг талбаруудыг бүтээнэ. */
function logFields(method: string, query: string, extra: logger.Fields = {}): logger.Fields {
  return { repository: repositoryName, method, query, file: fileName, table: 'users', ...extra };
}

class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  // ─────────────────────────── Store ───────────────────────────

  async store(ctx: Ctx, input: User): Promise<User> {
    // INSERT ... RETURNING — дуудагч хадгалагдсан мөрийг нэг round-trip-д авна.
    // id нь uuid_generate_v4() баганын өгөгдмөл утгаар сервер талд үүснэ.
    try {
      const row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<UsersRecord>(
          `INSERT INTO users(id, username, first_name, last_name, first_name_en, last_name_en, email, password, active, role_id, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, false, $8, $9)
           RETURNING ${UserColumns}`,
          [
            input.username,
            input.firstName,
            input.lastName,
            input.firstNameEn,
            input.lastNameEn,
            ptrOrNil(input.email),
            ptrOrNil(input.password),
            input.roleId,
            input.createdAt,
          ],
        );
        return res.rows[0];
      });
      if (!row) {
        const e = new Error('insert succeeded but RETURNING produced no row');
        logger.errorWithContext(ctx, 'Insert returned no row', {
          ...logFields('store', 'insertUser'),
          error: e.message,
        });
        throw internalCause(e);
      }
      return userRecordToDomain(row);
    } catch (err) {
      if (err instanceof DomainError) throw err;
      // 23505 unique_violation-г 409 Conflict болгон буулгана.
      if (isUniqueViolation(err)) {
        logger.errorWithContext(ctx, 'Failed to insert user: unique violation', {
          ...logFields('store', 'insertUser', { email: input.email }),
          error: logger.errText(err),
        });
        throw conflict('username or email already exists');
      }
      logger.errorWithContext(ctx, 'Failed to insert user into database', {
        ...logFields('store', 'insertUser'),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
  }

  // ────────────────────────── Read by key ──────────────────────────

  async getByEmail(ctx: Ctx, email: string): Promise<User> {
    // Soft-delete хийгдсэн мөрүүдийг ИЛ-ээр хас — "устгагдсан" хэрэглэгчид
    // audit/сэргээх зорилгоор хадгалагдах боловч нэвтрэх урсгалыг хангах ёсгүй.
    return this.selectOne(
      ctx,
      `SELECT ${UserColumns} FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
      'getByEmail',
      'selectUserByEmail',
      { email },
    );
  }

  async getById(ctx: Ctx, id: string): Promise<User> {
    return this.selectOne(
      ctx,
      `SELECT ${UserColumns} FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
      'getById',
      'selectUserByID',
      { user_id: id },
    );
  }

  async getByGoogleSub(ctx: Ctx, sub: string): Promise<User> {
    return this.selectOne(
      ctx,
      `SELECT ${UserColumns} FROM users WHERE google_sub = $1 AND deleted_at IS NULL`,
      [sub],
      'getByGoogleSub',
      'selectUserByGoogleSub',
    );
  }

  /** getByNationalId нь national_id-ээр (жижиг үсгээр харьцуулж) хайна. */
  async getByNationalId(ctx: Ctx, nationalId: string): Promise<User> {
    return this.selectOne(
      ctx,
      `SELECT ${UserColumns} FROM users WHERE lower(national_id) = lower($1) AND deleted_at IS NULL`,
      [nationalId],
      'getByNationalId',
      'selectUserByNationalID',
    );
  }

  /**
   * selectOne нь "нэг мөр эсвэл notFound" хэлбэрийн уншилтуудын хуваалцсан хэсэг.
   * Мөр байхгүй бол apperror.notFound; бусад алдаа логдож internalCause болно.
   */
  private async selectOne(
    ctx: Ctx,
    sql: string,
    params: readonly unknown[],
    method: string,
    query: string,
    extra: logger.Fields = {},
  ): Promise<User> {
    let row: UsersRecord | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<UsersRecord>(sql, params);
        return res.rows[0];
      });
    } catch (err) {
      logger.errorWithContext(ctx, `Failed to query user (${method})`, {
        ...logFields(method, query, extra),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
    if (!row) throw notFound('user not found');
    return userRecordToDomain(row);
  }

  // ────────────────────────────── eID ──────────────────────────────

  /**
   * upsertFromEID нь eID identity-аар хэрэглэгчийг үүсгэх/шинэчлэх. civil_id
   * дээрх partial unique index (idx_users_civil_id_active, migration 13)-д
   * тулгуурлан ON CONFLICT хийнэ.
   *
   * Public RP-д IdP national_id-г илчлэхгүй тул түлхүүр нь civil_id (national_id
   * хоосон байж болзошгүй). civil_id-г жижиг үсгээр, national_id хоосон бол
   * NULL-ээр хадгална — эс бөгөөс lower(national_id) partial unique index олон
   * eID хэрэглэгчид мөргөлдөнө. eID хэрэглэгч нууц үг/email-гүй тул NULL.
   */
  async upsertFromEID(ctx: Ctx, input: User): Promise<User> {
    try {
      const row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<UsersRecord>(
          `INSERT INTO users(id, username, first_name, last_name, first_name_en, last_name_en, email, password, active, role_id, national_id, civil_id, kyc_level, document_number, cert_serial, cert_not_before, cert_not_after, cert_issuer, cert_key_type, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NULL, NULL, true, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (lower(civil_id)) WHERE civil_id IS NOT NULL
           DO UPDATE SET
             first_name      = EXCLUDED.first_name,
             last_name       = EXCLUDED.last_name,
             -- Латин нэрийг НЭГ УДАА (анхны insert-д) л eID-ээс авна; дараа нь
             -- дарж бичихгүй (COALESCE) — автомат галиглалт заримдаа буруу тул
             -- хэрэглэгч гараар засах бөгөөд тэр засвар нь дараагийн
             -- нэвтрэлтэд хэвээр байх ёстой.
             first_name_en   = COALESCE(users.first_name_en, EXCLUDED.first_name_en),
             last_name_en    = COALESCE(users.last_name_en, EXCLUDED.last_name_en),
             national_id     = EXCLUDED.national_id,
             kyc_level       = EXCLUDED.kyc_level,
             document_number = EXCLUDED.document_number,
             cert_serial     = EXCLUDED.cert_serial,
             cert_not_before = EXCLUDED.cert_not_before,
             cert_not_after  = EXCLUDED.cert_not_after,
             cert_issuer     = EXCLUDED.cert_issuer,
             cert_key_type   = EXCLUDED.cert_key_type,
             active          = true,
             updated_at      = now()
           RETURNING ${UserColumns}`,
          [
            input.username,
            input.firstName,
            input.lastName,
            ptrOrNil(input.firstNameEn),
            ptrOrNil(input.lastNameEn),
            input.roleId,
            ptrOrNil(input.nationalId),
            ptrOrNil(input.civilId),
            ptrOrNil(input.kycLevel),
            ptrOrNil(input.documentNumber),
            ptrOrNil(input.certSerial),
            input.certNotBefore,
            input.certNotAfter,
            ptrOrNil(input.certIssuer),
            ptrOrNil(input.certKeyType),
            input.createdAt,
          ],
        );
        return res.rows[0];
      });
      if (!row) {
        const e = new Error('upsert succeeded but RETURNING produced no row');
        logger.errorWithContext(ctx, 'eID upsert returned no row', {
          ...logFields('upsertFromEID', 'upsertUserFromEID'),
          error: e.message,
        });
        throw internalCause(e);
      }
      return userRecordToDomain(row);
    } catch (err) {
      if (err instanceof DomainError) throw err;
      logger.errorWithContext(ctx, 'Failed to upsert eID user', {
        ...logFields('upsertFromEID', 'upsertUserFromEID'),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
  }

  // ───────────────────────────── Google ─────────────────────────────

  /**
   * linkGoogleAccount нь Google account + профайлыг холбоно/шинэчилнэ.
   * google_linked_at-ийг COALESCE-оор нэг л удаа (анх холбоход) тэмдэглэж,
   * дараагийн нэвтрэлтэд профайлыг шинэчлэхэд хэвээр үлдээнэ.
   */
  async linkGoogleAccount(ctx: Ctx, userId: string, acct: GoogleAccount): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE users
              SET google_sub = $2,
                  google_email = $3,
                  google_email_verified = $4,
                  google_name = $5,
                  google_picture = $6,
                  -- Google холбоход хэрэглэгчийн email хоосон бол gmail хаягаар
                  -- дүүргэнэ (аль хэдийн email-тэй бол дарж бичихгүй).
                  email = COALESCE(NULLIF(email, ''), $3),
                  google_linked_at = COALESCE(google_linked_at, now()),
                  updated_at = now()
            WHERE id = $1 AND deleted_at IS NULL`,
          [
            userId,
            acct.sub,
            ptrOrNil(acct.email),
            acct.emailVerified,
            ptrOrNil(acct.name),
            ptrOrNil(acct.picture),
          ],
        );
        if (res.rowCount === 0) throw notFound('user not found');
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      if (isUniqueViolation(err)) {
        throw conflict('this Google account is already linked to another user');
      }
      throw internalCause(err);
    }
  }

  /** unlinkGoogle нь Google холболтыг арилгана — google-ээр дахин нэвтрэх боломжгүй болно. */
  async unlinkGoogle(ctx: Ctx, userId: string): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE users
              SET google_sub = NULL, google_email = NULL, google_email_verified = false,
                  google_name = NULL, google_picture = NULL, google_linked_at = NULL,
                  updated_at = now()
            WHERE id = $1 AND deleted_at IS NULL`,
          [userId],
        );
        if (res.rowCount === 0) throw notFound('user not found');
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }

  // ────────────────────── Pre-registration (admin) ──────────────────────

  /**
   * createPreRegistered нь админ иргэнийг РЕГИСТРИЙН ДУГААР (national_id)-аар
   * урьдчилан бүртгэнэ: national_id + нэр + role-той идэвхтэй мөр, гэхдээ
   * password/email/civil_id-гүй. Иргэн хожим eID-ээр нэвтрэхэд upsert нь энэ
   * мөрийг national_id-аар олж, civil_id-г залгана (давхардал үүсэхгүй).
   */
  async createPreRegistered(ctx: Ctx, input: User): Promise<User> {
    try {
      const row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<UsersRecord>(
          `INSERT INTO users(id, username, first_name, last_name, first_name_en, last_name_en, email, password, active, role_id, national_id, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NULL, NULL, true, $6, $7, now())
           RETURNING ${UserColumns}`,
          [
            input.username,
            input.firstName,
            input.lastName,
            ptrOrNil(input.firstNameEn),
            ptrOrNil(input.lastNameEn),
            input.roleId,
            ptrOrNil(input.nationalId),
          ],
        );
        return res.rows[0];
      });
      if (!row) {
        throw internalCause(
          new Error('pre-register insert succeeded but RETURNING produced no row'),
        );
      }
      return userRecordToDomain(row);
    } catch (err) {
      if (err instanceof DomainError) throw err;
      if (isUniqueViolation(err)) {
        throw conflict('энэ регистрийн дугаар аль хэдийн бүртгэлтэй байна');
      }
      if (pgErrorCode(err) === PgForeignKeyViolation) throw badRequest('unknown role');
      throw internalCause(err);
    }
  }

  // ───────────────────────────── Listing ─────────────────────────────

  async list(ctx: Ctx, filter: UserListFilter, offset: number, limit: number): Promise<User[]> {
    const cappedLimit = limit <= 0 || limit > hardLimit ? hardLimit : limit;
    const safeOffset = offset < 0 ? 0 : offset;

    // Query-г динамикаар бүтээ — утга бүр $N parameter болж холбогдоно, хэзээ ч
    // SQL мөр рүү залгагддаггүй.
    let sql = `SELECT ${UserColumns} FROM users WHERE 1=1`;
    const args: unknown[] = [];
    if (!filter.includeDeleted) sql += ' AND deleted_at IS NULL';
    if (filter.roleId) {
      args.push(filter.roleId);
      sql += ` AND role_id = $${args.length}`;
    }
    if (filter.activeOnly) {
      args.push(true);
      sql += ` AND active = $${args.length}`;
    }
    args.push(cappedLimit, safeOffset);
    sql += ` ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;

    try {
      const rows = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<UsersRecord>(sql, args);
        return res.rows;
      });
      return usersToDomain(rows);
    } catch (err) {
      logger.errorWithContext(ctx, 'Failed to list users', {
        ...logFields('list', 'selectUsersList', { limit: cappedLimit, offset: safeOffset }),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
  }

  /**
   * listAdmins нь админ түвшний бүх бүртгэлийг (super admin + admin) буцаана.
   * role_id өсөх дарааллаар (super admin эхэнд), дараа нь шинээр үүсгэснээр.
   */
  async listAdmins(ctx: Ctx): Promise<User[]> {
    try {
      const rows = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<UsersRecord>(
          `SELECT ${UserColumns}
             FROM users
            WHERE role_id IN ($1, $2) AND deleted_at IS NULL
            ORDER BY role_id ASC, created_at DESC`,
          [RoleSuperAdmin, RoleAdmin],
        );
        return res.rows;
      });
      return usersToDomain(rows);
    } catch (err) {
      logger.errorWithContext(ctx, 'Failed to list admins', {
        ...logFields('listAdmins', 'selectAdmins'),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
  }

  // ───────────────────────────── Mutations ─────────────────────────────

  /** changeActiveUser нь active flag-г сольж updated_at-г тэмдэглэнэ (амьд мөр дээр). */
  async changeActiveUser(ctx: Ctx, id: string, active: boolean): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        await tx.query(
          `UPDATE users SET active = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
          [active, new Date(), id],
        );
      });
    } catch (err) {
      logger.errorWithContext(ctx, 'Failed to update user active flag', {
        ...logFields('changeActiveUser', 'updateUserActive', { user_id: id }),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
  }

  async updatePassword(ctx: Ctx, input: User): Promise<void> {
    let rowCount = 0;
    try {
      rowCount = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE users SET password = $1, password_changed_at = $2, updated_at = $3 WHERE id = $4 AND deleted_at IS NULL`,
          [ptrOrNil(input.password), input.passwordChangedAt, input.updatedAt, input.id],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      logger.errorWithContext(ctx, 'Failed to update user password', {
        ...logFields('updatePassword', 'updateUserPassword', { user_id: input.id }),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
    if (rowCount === 0) throw notFound('user not found');
  }

  /**
   * softDelete нь deleted_at-г тавина. Амьд мөр дээрх `deleted_at IS NULL` Where
   * нь үйлдлийг idempotent байлгана — аль хэдийн устгагдсан мөрийг алгасна.
   */
  async softDelete(ctx: Ctx, id: string): Promise<void> {
    let rowCount = 0;
    try {
      const now = new Date();
      rowCount = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE users SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
          [now, id],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      logger.errorWithContext(ctx, 'Failed to soft-delete user', {
        ...logFields('softDelete', 'softDeleteUser', { user_id: id }),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
    if (rowCount === 0) throw notFound('user not found');
  }

  /**
   * updateRole нь role_id-г солино. role_id нь roles(id)-руу FK тул байхгүй role
   * оноох оролдлого 23503 (foreign_key_violation) болж гарна.
   */
  async updateRole(ctx: Ctx, id: string, roleId: number): Promise<void> {
    let rowCount = 0;
    try {
      rowCount = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(
          `UPDATE users SET role_id = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL`,
          [roleId, id],
        );
        return res.rowCount ?? 0;
      });
    } catch (err) {
      if (pgErrorCode(err) === PgForeignKeyViolation) throw badRequest('unknown role');
      logger.errorWithContext(ctx, 'Failed to update user role', {
        ...logFields('updateRole', 'updateUserRole', { user_id: id, role_id: roleId }),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
    if (rowCount === 0) throw notFound('user not found');
  }

  // ─────────────────────── Signature / Latin name ───────────────────────

  /**
   * getSignature нь гарын үсгийн зургийг (data-URL) буцаана. Тавиагүй бол хоосон
   * мөр. withRLS дор ажилладаг тул зөвхөн өөрийн мөрөнд хандана.
   */
  async getSignature(ctx: Ctx, userId: string): Promise<string> {
    let row: { signature_image: string } | undefined;
    try {
      row = await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query<{ signature_image: string }>(
          `SELECT COALESCE(signature_image,'') AS signature_image FROM users WHERE id = $1 AND deleted_at IS NULL`,
          [userId],
        );
        return res.rows[0];
      });
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('user not found');
    return row.signature_image;
  }

  /** setSignature нь гарын үсгийн зургийг тавина/шинэчилнэ; хоосон img нь баганыг NULL болгоно. */
  async setSignature(ctx: Ctx, userId: string, img: string): Promise<void> {
    await this.updateOwnRow(
      ctx,
      `UPDATE users SET signature_image = NULLIF($1,''), updated_at = now() WHERE id = $2 AND deleted_at IS NULL`,
      [img, userId],
    );
  }

  /**
   * setLatinName нь латин нэрийг гараар засна. eID-ийн автомат галиглалт заримдаа
   * буруу гардаг тул засварлах боломж; upsertFromEID нь дараа нь дарж бичихгүй
   * (COALESCE).
   */
  async setLatinName(ctx: Ctx, userId: string, firstEn: string, lastEn: string): Promise<void> {
    await this.updateOwnRow(
      ctx,
      `UPDATE users SET first_name_en = NULLIF($1,''), last_name_en = NULLIF($2,''), updated_at = now() WHERE id = $3 AND deleted_at IS NULL`,
      [firstEn.trim(), lastEn.trim(), userId],
    );
  }

  /** updateOwnRow нь "нэг мөр өөрчил, эс бөгөөс notFound" хэлбэрийн бичилтүүдийн хуваалцсан хэсэг. */
  private async updateOwnRow(ctx: Ctx, sql: string, params: readonly unknown[]): Promise<void> {
    try {
      await this.db.withRLS(ctx, async (tx) => {
        const res = await tx.query(sql, params);
        if (res.rowCount === 0) throw notFound('user not found');
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw internalCause(err);
    }
  }

  // ─────────────────────────── Super admin ───────────────────────────

  /**
   * upsertSuperAdmin нь superadmin onboarding-ийн ТӨГСГӨЛД super admin
   * хэрэглэгчийг үүсгэх/ахиулна.
   *
   * Түлхүүр нь google_sub (idx_users_google_sub_active): тухайн Google account аль
   * хэдийн байгаа бол мөрийг ахиулж (role_id, email, Google профайл), эс бөгөөс
   * шинэ идэвхтэй super admin мөр оруулна. superadmin_accounts satellite мөр нь
   * ИЖИЛ ТРАНЗАКЦИД бичигдэнэ (атом).
   *
   * АНХААР: totpSecret нь usecase давхаргад AES-GCM-ээр аль хэдийн шифрлэгдсэн
   * ирнэ — энэ давхаргад ил текст secret ХЭЗЭЭ Ч бичигдэхгүй. civil_id-г users-д
   * ТАВИХГҮЙ тул нэг хүн eID-ээр admin, Google-оор super admin байж чадна.
   */
  async upsertSuperAdmin(ctx: Ctx, input: User, account: SuperadminAccount): Promise<User> {
    try {
      const row = await this.db.withRLS(ctx, async (tx: Queryable) => {
        // 1) users мөр — google_sub-аар түлхүүрлэсэн (civil_id/MFA users-д ТАВИХГҮЙ).
        const res = await tx.query<UsersRecord>(
          `INSERT INTO users(
             id, username, first_name, last_name, first_name_en, last_name_en,
             email, password, active, role_id, kyc_level,
             google_sub, google_email, google_email_verified, google_name, google_picture, google_linked_at,
             created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5,
             $6, NULL, true, $7, $8,
             $9, $10, $11, $12, $13, now(),
             now())
           ON CONFLICT (google_sub) WHERE google_sub IS NOT NULL AND deleted_at IS NULL
           DO UPDATE SET
             first_name            = EXCLUDED.first_name,
             last_name             = EXCLUDED.last_name,
             -- Латин нэрийг НЭГ УДАА л авна; хэрэглэгчийн гар засварыг дарж бичихгүй.
             first_name_en         = COALESCE(users.first_name_en, EXCLUDED.first_name_en),
             last_name_en          = COALESCE(users.last_name_en, EXCLUDED.last_name_en),
             kyc_level             = EXCLUDED.kyc_level,
             email                 = EXCLUDED.email,
             google_email          = EXCLUDED.google_email,
             google_email_verified = EXCLUDED.google_email_verified,
             google_name           = EXCLUDED.google_name,
             google_picture        = EXCLUDED.google_picture,
             google_linked_at      = COALESCE(users.google_linked_at, now()),
             role_id               = EXCLUDED.role_id,
             active                = true,
             updated_at            = now()
           RETURNING ${UserColumns}`,
          [
            input.username,
            input.firstName,
            input.lastName,
            ptrOrNil(input.firstNameEn),
            ptrOrNil(input.lastNameEn),
            ptrOrNil(input.email),
            input.roleId,
            ptrOrNil(input.kycLevel),
            ptrOrNil(input.googleSub),
            ptrOrNil(input.googleEmail),
            input.googleEmailVerified,
            ptrOrNil(input.googleName),
            ptrOrNil(input.googlePicture),
          ],
        );
        const stored = res.rows[0];
        if (!stored) return undefined;

        // 2) superadmin_accounts satellite мөр — ижил транзакцид (атом).
        await tx.query(
          `INSERT INTO superadmin_accounts(
             user_id, civil_id, national_id, email_verified, mfa_enabled, totp_secret, invited_by, onboarded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (user_id) DO UPDATE SET
             civil_id       = EXCLUDED.civil_id,
             national_id    = EXCLUDED.national_id,
             email_verified = EXCLUDED.email_verified,
             mfa_enabled    = EXCLUDED.mfa_enabled,
             totp_secret    = EXCLUDED.totp_secret,
             invited_by     = COALESCE(NULLIF(EXCLUDED.invited_by, ''), superadmin_accounts.invited_by),
             onboarded_at   = COALESCE(superadmin_accounts.onboarded_at, now()),
             updated_at     = now()`,
          [
            stored.id,
            ptrOrNil(account.civilId),
            ptrOrNil(account.nationalId),
            account.emailVerified,
            account.mfaEnabled,
            ptrOrNil(account.totpSecret),
            account.invitedBy,
          ],
        );
        return stored;
      });

      if (!row) {
        const e = new Error('upsert succeeded but RETURNING produced no row');
        logger.errorWithContext(ctx, 'superadmin upsert returned no row', {
          ...logFields('upsertSuperAdmin', 'upsertSuperAdmin'),
          error: e.message,
        });
        throw internalCause(e);
      }

      // Буцаах user-ыг satellite account-ийн MFA утгуудаар hydrate хийнэ (users
      // хүснэгтэд эдгээр багана байхгүй; дуудагч session олгоход ашиглана).
      const dom = userRecordToDomain(row);
      dom.emailVerified = account.emailVerified;
      dom.mfaEnabled = account.mfaEnabled;
      dom.totpSecret = account.totpSecret;
      return dom;
    } catch (err) {
      if (err instanceof DomainError) throw err;
      // Урьсан и-мэйл / Google account өөр бүртгэлд аль хэдийн эзэмшигдсэн бол
      // цэвэр 409 болгоно.
      if (isUniqueViolation(err)) {
        logger.errorWithContext(ctx, 'superadmin upsert conflict', {
          ...logFields('upsertSuperAdmin', 'upsertSuperAdmin', {
            constraint: (err as { constraint?: string }).constraint ?? '',
          }),
        });
        throw conflict('this email or Google account is already linked to another user');
      }
      logger.errorWithContext(ctx, 'Failed to upsert super admin', {
        ...logFields('upsertSuperAdmin', 'upsertSuperAdmin'),
        error: logger.errText(err),
      });
      throw internalCause(err);
    }
  }
}

/** newUserRepository нь users-ийн postgres адаптерыг бүтээнэ. */
export function newUserRepository(db: Db): UserRepository {
  return new PostgresUserRepository(db);
}
