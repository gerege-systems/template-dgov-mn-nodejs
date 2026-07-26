// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/superadmin нь super admin-ий "админуудыг удирдах" давхарга: админ
// түвшний бүртгэлүүдийг жагсаах, шинэ админ үүсгэх, байгаа хэрэглэгчид админ
// эрх олгох/хасах, super admin урилга (allow-list) болон платформын хандалтын
// горим. Бүх мутаци hash-chained audit log-д бичигдэнэ.
//
// Зохион байгуулалтын дүрэм (least-privilege / зэрэглэлийн шатлал):
//   • Зөвхөн super admin (requireSuperAdmin gate) энэ давхаргад хүрнэ.
//   • Энэ давхарга ЗӨВХӨН admin зэрэглэлийг үүсгэж/олгож/хасна; super admin
//     зэрэглэлийг API-аар ХЭЗЭЭ Ч үүсгэдэггүй (bootstrap/onboarding-оор л).
//   • Өөрийгөө хасаж болохгүй, super admin-г хасаж болохгүй (lockout хаалт).

import {
  badRequest,
  conflict,
  forbidden,
  internal,
  isNotFound,
  notFound,
} from '../../apperror/index.js';
import type { SuperadminInviteRepository } from '../../datasources/repositories/interface/superadmin.js';
import {
  emptyUser,
  isAdmin,
  isSuperAdmin,
  RoleAdmin,
  RoleSuperAdmin,
  RoleUser,
} from '../../domain/users.js';
import type { User } from '../../domain/users.js';
import { normalizeInviteEmail } from '../../domain/superadmin_account.js';
import type { SuperadminInvite } from '../../domain/superadmin_account.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';
import type { AuditUsecase } from '../audit/audit_usecase.js';
import type { UsersUsecase } from '../users/users_usecase.js';

/** Audit action-ууд (hash-chained audit log); category нь бүгд "superadmin". */
const actionCreateAdmin = 'superadmin.create_admin';
const actionGrantAdmin = 'superadmin.grant_admin';
const actionRevokeAdmin = 'superadmin.revoke_admin';
const actionCreateInvite = 'superadmin.create_invite';
const actionDeleteInvite = 'superadmin.delete_invite';
const auditCategory = 'superadmin';

/**
 * AccessModeStore нь платформын хандалтын горимыг унших/бичих хамгийн бага
 * хараат байдал (postgres/platformsettings).
 */
export interface AccessModeStore {
  getAccessMode(ctx: Ctx): Promise<string>;
  setAccessMode(ctx: Ctx, mode: string): Promise<void>;
}

export interface CreateAdminInput {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
}

export interface SuperadminUsecase {
  /** listAdmins нь админ түвшний бүх бүртгэлийг (super admin + admin) буцаана. */
  listAdmins(ctx: Ctx): Promise<User[]>;
  /** createAdmin нь шинэ, ИДЭВХТЭЙ admin бүртгэл үүсгэнэ. */
  createAdmin(ctx: Ctx, input: CreateAdminInput): Promise<User>;
  /** grantAdmin нь байгаа хэрэглэгчид admin эрх олгоно. */
  grantAdmin(ctx: Ctx, userId: string): Promise<void>;
  /**
   * addAdminByRegister нь регистрийн дугаараар платформд БАЙГАА хэрэглэгчийг
   * admin болгоно. Үндэсний бүртгэл рүү ХАНДАХГҮЙ; тухайн регистрээр
   * хэрэглэгч байхгүй бол NotFound — шинэ хэрэглэгч ҮҮСГЭХГҮЙ.
   */
  addAdminByRegister(ctx: Ctx, register: string): Promise<User>;
  /** lookupByRegister нь эрх олгохоос ӨМНӨХ preview (промоушн хийхгүй). */
  lookupByRegister(ctx: Ctx, register: string): Promise<User>;
  /** revokeAdmin нь admin эрхийг хасч энгийн хэрэглэгч болгоно. */
  revokeAdmin(ctx: Ctx, userId: string, actorId: string): Promise<void>;

  listInvites(ctx: Ctx): Promise<SuperadminInvite[]>;
  createInvite(ctx: Ctx, email: string, actorEmail: string): Promise<SuperadminInvite>;
  deleteInvite(ctx: Ctx, email: string): Promise<void>;

  getAccessMode(ctx: Ctx): Promise<string>;
  setAccessMode(ctx: Ctx, mode: string): Promise<void>;
}

/** emailPattern нь урилгын и-мэйлийн энгийн хэлбэрийн шалгалт. */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class SuperadminUsecaseImpl implements SuperadminUsecase {
  constructor(
    private readonly users: UsersUsecase,
    private readonly audit: AuditUsecase,
    /** invites нь null байж болно — тэр үед урилгын endpoint-ууд 500 өгнө. */
    private readonly invites: SuperadminInviteRepository | null,
    private readonly platform: AccessModeStore,
  ) {}

  // ── Админ удирдлага ─────────────────────────────────────────────────

  async listAdmins(ctx: Ctx): Promise<User[]> {
    const res = await this.users.listAdmins(ctx);
    return res.users;
  }

  /**
   * createAdmin нь шинэ админ үүсгэнэ. users.store нь ИДЭВХГҮЙ мөр оруулдаг
   * тул дараа нь setActive-ээр идэвхжүүлнэ (шинэ админ шууд ажиллах ёстой).
   */
  async createAdmin(ctx: Ctx, input: CreateAdminInput): Promise<User> {
    const stored = await this.users.store(ctx, {
      user: {
        // emptyUser нь бүх талбарыг тэг утгаар бөглөнө — usecase давхарга нь
        // зөвхөн бүртгэлийн талбаруудыг тавина (id/цагийг DB өгнө).
        ...emptyUser(),
        username: input.username,
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        firstNameEn: input.firstNameEn,
        lastNameEn: input.lastNameEn,
        roleId: RoleAdmin,
      },
    });
    await this.users.setActive(ctx, { userId: stored.user.id, active: true });
    const user: User = { ...stored.user, active: true };

    await this.record(ctx, actionCreateAdmin, user.id, {
      email: user.email,
      username: user.username,
    });
    return user;
  }

  async grantAdmin(ctx: Ctx, userId: string): Promise<void> {
    const existing = await this.users.getById(ctx, { id: userId });
    // Аль хэдийн админ түвшний бол дахин олгох нь утгагүй.
    if (isAdmin(existing.user)) throw conflict('user is already an admin');
    // callerRoleId — энэ usecase нь route түвшинд requireSuperAdmin-аар
    // хамгаалагдсан тул дуудагч нь super admin.
    await this.users.updateRole(ctx, {
      userId,
      roleId: RoleAdmin,
      callerRoleId: RoleSuperAdmin,
    });
    await this.record(ctx, actionGrantAdmin, userId, { email: existing.user.email });
  }

  async addAdminByRegister(ctx: Ctx, register: string): Promise<User> {
    const found = await this.findByRegister(ctx, register);
    if (isAdmin(found)) throw conflict('user is already an admin');
    await this.grantAdmin(ctx, found.id);
    return { ...found, roleId: RoleAdmin };
  }

  async lookupByRegister(ctx: Ctx, register: string): Promise<User> {
    return this.findByRegister(ctx, register);
  }

  /** findByRegister нь регистрээр платформын хэрэглэгчийг олно (эрх олгохгүй). */
  private async findByRegister(ctx: Ctx, register: string): Promise<User> {
    const normalized = register.trim().toUpperCase();
    if (normalized === '') throw badRequest('register is required');
    try {
      const found = await this.users.getByNationalId(ctx, { nationalId: normalized });
      return found.user;
    } catch (err) {
      // Тухайн регистрээр платформд хэрэглэгч байхгүй — шинэ хэрэглэгч
      // ҮҮСГЭХГҮЙ: тэр хүн эхлээд eID-ээр нэвтэрсэн байх ёстой.
      if (isNotFound(err)) {
        throw notFound(
          'this register is not registered on the platform — the person must sign in via eID first',
        );
      }
      throw err;
    }
  }

  async revokeAdmin(ctx: Ctx, userId: string, actorId: string): Promise<void> {
    // Lockout-аас сэргийлэх: super admin ӨӨРИЙГӨӨ хасаж болохгүй.
    if (userId === actorId) throw forbidden('you cannot revoke your own access');
    const existing = await this.users.getById(ctx, { id: userId });
    // super admin-г API-аар хасахгүй (зөвхөн DB/bootstrap).
    if (isSuperAdmin(existing.user)) throw forbidden('a super admin cannot be revoked');
    if (existing.user.roleId !== RoleAdmin) throw badRequest('user is not an admin');

    await this.users.updateRole(ctx, {
      userId,
      roleId: RoleUser,
      callerRoleId: RoleSuperAdmin,
    });
    await this.record(ctx, actionRevokeAdmin, userId, { email: existing.user.email });
  }

  // ── Урилга (allow-list) ─────────────────────────────────────────────

  async listInvites(ctx: Ctx): Promise<SuperadminInvite[]> {
    const invites = this.requireInvites();
    return invites.list(ctx);
  }

  /**
   * createInvite нь и-мэйлийг super admin болох allow-list-д нэмнэ.
   *
   * АНХААР: урилга нь super admin эрхийг ШУУД олгодоггүй — зөвхөн бүртгэлийн
   * шидтэнг (Google + eID + и-мэйл OTP + TOTP) эхлүүлэх хаалгыг нээнэ.
   */
  async createInvite(ctx: Ctx, email: string, actorEmail: string): Promise<SuperadminInvite> {
    const invites = this.requireInvites();
    const normalized = normalizeInviteEmail(email);
    if (normalized === '') throw badRequest('email is required');
    if (!emailPattern.test(normalized)) throw badRequest('email format is invalid');

    const invite = await invites.create(ctx, normalized, normalizeInviteEmail(actorEmail));
    await this.record(ctx, actionCreateInvite, normalized, {
      email: normalized,
      invited_by: invite.invitedBy,
    });
    return invite;
  }

  async deleteInvite(ctx: Ctx, email: string): Promise<void> {
    const invites = this.requireInvites();
    const normalized = normalizeInviteEmail(email);
    if (normalized === '') throw badRequest('email is required');
    await invites.deleteInvite(ctx, normalized);
    await this.record(ctx, actionDeleteInvite, normalized, { email: normalized });
  }

  private requireInvites(): SuperadminInviteRepository {
    if (!this.invites) throw internal('superadmin invites are not configured');
    return this.invites;
  }

  // ── Платформын хандалтын горим ──────────────────────────────────────

  getAccessMode(ctx: Ctx): Promise<string> {
    return this.platform.getAccessMode(ctx);
  }

  setAccessMode(ctx: Ctx, mode: string): Promise<void> {
    // Утгын шалгалт нь store давхаргад (public|private).
    return this.platform.setAccessMode(ctx, mode);
  }

  /**
   * record нь audit үйл явдлыг best-effort бичнэ — actor-г audit давхарга
   * хүсэлтийн RLS контекстээс өөрөө уншина. Бичих алдаа нь ҮНДСЭН үйлдлийг
   * бүтэлгүйтүүлэхгүй, зөвхөн warning үлдээнэ.
   */
  private async record(
    ctx: Ctx,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.recordEvent(ctx, action, auditCategory, target, metadata);
    } catch (err) {
      logger.warnWithContext(ctx, 'superadmin audit event бичих амжилтгүй', {
        action,
        target,
        error: logger.errText(err),
      });
    }
  }
}

export const newSuperadminUsecase = (
  users: UsersUsecase,
  audit: AuditUsecase,
  invites: SuperadminInviteRepository | null,
  platform: AccessModeStore,
): SuperadminUsecase => new SuperadminUsecaseImpl(users, audit, invites, platform);
