// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /superadmin/* endpoint-ууд — админ удирдлага, super admin урилга (allow-list)
// болон платформын хандалтын горим. Бүх route нь requireSuperAdmin-ээр
// хамгаалагдсан тул энгийн admin ч хүрэхгүй (least-privilege).

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { SuperadminUsecase } from '../../../../usecases/superadmin/superadmin_usecase.js';
import {
  adminUserListResponse,
  adminUserResponse,
  superadminInviteListResponse,
  superadminInviteResponse,
} from '../../../dto/responses/superadmin.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const createAdminSchema = strictObject({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  first_name_en: z.string().max(100).optional(),
  last_name_en: z.string().max(100).optional(),
});

const byRegisterSchema = strictObject({ register: z.string().min(8).max(20) });

const inviteSchema = strictObject({ email: z.string().email().max(200) });

/** accessModeSchema — public: хэн ч SSO-оор; private: зөвхөн урьдчилан бүртгэсэн. */
const accessModeSchema = strictObject({ mode: z.enum(['public', 'private']) });

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

const queryValue = (req: Request, key: string): string => {
  const raw: unknown = req.query[key];
  return typeof raw === 'string' ? raw : '';
};

export class SuperadminHandler {
  constructor(private readonly usecase: SuperadminUsecase) {}

  /** GET /superadmin/admins · Bearer + super admin · 200 */
  listAdmins: AsyncHandler = async (req, res) => {
    const admins = await this.usecase.listAdmins(req.ctx);
    newSuccessResponse(req, res, 200, 'admins fetched successfully', adminUserListResponse(admins));
  };

  /** POST /superadmin/admins · Bearer + super admin · 201 · 409 · 422 */
  createAdmin: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, createAdminSchema);
    const user = await this.usecase.createAdmin(req.ctx, {
      username: body.username,
      email: body.email,
      password: body.password,
      firstName: body.first_name ?? '',
      lastName: body.last_name ?? '',
      firstNameEn: body.first_name_en ?? '',
      lastNameEn: body.last_name_en ?? '',
    });
    newSuccessResponse(req, res, 201, 'admin created successfully', adminUserResponse(user));
  };

  /**
   * GET /superadmin/admins/by-register?register=… — эрх олгохоос ӨМНӨХ preview.
   * Тухайн регистрээр платформд хэрэглэгч байхгүй бол 404 (шинэ хэрэглэгч
   * ҮҮСГЭХГҮЙ — тэр хүн эхлээд eID-ээр нэвтэрсэн байх ёстой).
   */
  lookupByRegister: AsyncHandler = async (req, res) => {
    const user = await this.usecase.lookupByRegister(req.ctx, queryValue(req, 'register'));
    newSuccessResponse(req, res, 200, 'user found', adminUserResponse(user));
  };

  /** POST /superadmin/admins/by-register · Bearer + super admin · 200 · 404 · 409 */
  addAdminByRegister: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, byRegisterSchema);
    const user = await this.usecase.addAdminByRegister(req.ctx, body.register);
    newSuccessResponse(req, res, 200, 'admin added successfully', adminUserResponse(user));
  };

  /** PUT /superadmin/admins/:id/grant · Bearer + super admin · 200 · 409 */
  grantAdmin: AsyncHandler = async (req, res) => {
    await this.usecase.grantAdmin(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'admin access granted successfully');
  };

  /**
   * DELETE /superadmin/admins/:id — admin эрхийг хасна. Өөрийгөө хасах болон
   * super admin-г хасах нь 403 (lockout хаалт).
   */
  revokeAdmin: AsyncHandler = async (req, res) => {
    const actor = currentUserFromRequest(req);
    if (!actor) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    await this.usecase.revokeAdmin(req.ctx, pathParam(req, 'id'), actor.id);
    newSuccessResponse(req, res, 200, 'admin access revoked successfully');
  };

  /** GET /superadmin/invites · Bearer + super admin · 200 */
  listInvites: AsyncHandler = async (req, res) => {
    const invites = await this.usecase.listInvites(req.ctx);
    newSuccessResponse(
      req,
      res,
      200,
      'invites fetched successfully',
      superadminInviteListResponse(invites),
    );
  };

  /**
   * POST /superadmin/invites — и-мэйлийг super admin болох allow-list-д нэмнэ.
   * Урилга нь эрхийг ШУУД олгодоггүй: onboarding шидтэн (Google + eID + и-мэйл
   * OTP + TOTP) бүрэн давсны дараа л super admin болно.
   */
  createInvite: AsyncHandler = async (req, res) => {
    const actor = currentUserFromRequest(req);
    if (!actor) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, inviteSchema);
    const invite = await this.usecase.createInvite(req.ctx, body.email, actor.email);
    newSuccessResponse(
      req,
      res,
      201,
      'invite created successfully',
      superadminInviteResponse(invite),
    );
  };

  /** DELETE /superadmin/invites/:email · Bearer + super admin · 200 · 404 */
  deleteInvite: AsyncHandler = async (req, res) => {
    await this.usecase.deleteInvite(req.ctx, pathParam(req, 'email'));
    newSuccessResponse(req, res, 200, 'invite deleted successfully');
  };

  /** GET /superadmin/access-mode · Bearer + super admin · 200 */
  getAccessMode: AsyncHandler = async (req, res) => {
    const mode = await this.usecase.getAccessMode(req.ctx);
    newSuccessResponse(req, res, 200, 'access mode fetched successfully', { mode });
  };

  /** PUT /superadmin/access-mode · Bearer + super admin · 200 · 422 */
  setAccessMode: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, accessModeSchema);
    await this.usecase.setAccessMode(req.ctx, body.mode);
    newSuccessResponse(req, res, 200, 'access mode updated successfully', { mode: body.mode });
  };
}

export const newSuperadminHandler = (usecase: SuperadminUsecase): SuperadminHandler =>
  new SuperadminHandler(usecase);
