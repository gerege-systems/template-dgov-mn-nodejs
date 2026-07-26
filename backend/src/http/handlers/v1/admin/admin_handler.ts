// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /admin/users/* endpoint-ууд — хэрэглэгчийн удирдлага (`users.manage`).
// Зэрэглэлийн шалгалт (admin эрхийг зөвхөн super admin олгоно) нь users
// usecase-д — handler нь дуудагчийн role-ыг ДАМЖУУЛНА, өөрөө шийддэггүй.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { UsersUsecase } from '../../../../usecases/users/users_usecase.js';
import { adminUserListResponse, adminUserResponse } from '../../../dto/responses/superadmin.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const defaultLimit = 50;
const maxLimit = 200;

const updateRoleSchema = strictObject({ role_id: z.number().int().min(1).max(4) });

const setActiveSchema = strictObject({ active: z.boolean() });

/**
 * createUserSchema нь private платформын урьдчилсан бүртгэл — иргэн хожим
 * Government SSO-оор нэвтэрхэд энэ мөр civil_id/sso_sub-оор холбогдоно.
 */
const createUserSchema = strictObject({
  register: z.string().min(8).max(20),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  first_name_en: z.string().max(100).optional(),
  last_name_en: z.string().max(100).optional(),
  role_id: z.number().int().min(1).max(4).optional(),
});

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

/** queryInt нь query-г бүхэл тоо болгоно; буруу бол өгөгдмөл (400 БИШ). */
function queryInt(req: Request, key: string, def: number): number {
  const raw: unknown = req.query[key];
  if (typeof raw !== 'string' || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

export class AdminHandler {
  constructor(private readonly users: UsersUsecase) {}

  /**
   * listUsers нь хэрэглэгчдийг хуудаслан буцаана.
   *
   * GET /admin/users?offset=&limit=&role=&active= · Bearer + users.manage · 200
   */
  listUsers: AsyncHandler = async (req, res) => {
    let limit = queryInt(req, 'limit', defaultLimit);
    if (limit <= 0 || limit > maxLimit) limit = defaultLimit;
    const out = await this.users.list(req.ctx, {
      roleId: queryInt(req, 'role', 0),
      activeOnly: req.query.active === 'true',
      offset: queryInt(req, 'offset', 0),
      limit,
    });
    newSuccessResponse(
      req,
      res,
      200,
      'users fetched successfully',
      adminUserListResponse(out.users),
    );
  };

  /**
   * createUser нь иргэнийг регистрийн дугаараар урьдчилан бүртгэнэ (private
   * платформ). admin/superadmin role-ыг ЗӨВХӨН super admin ононо — шалгалт
   * usecase давхаргад, дуудагчийн role-оор.
   *
   * POST /admin/users · Bearer + users.manage · 201 · 403 · 409 · 422
   */
  createUser: AsyncHandler = async (req, res) => {
    const caller = currentUserFromRequest(req);
    if (!caller) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, createUserSchema);
    const user = await this.users.createPreRegistered(req.ctx, {
      register: body.register,
      firstName: body.first_name ?? '',
      lastName: body.last_name ?? '',
      firstNameEn: body.first_name_en ?? '',
      lastNameEn: body.last_name_en ?? '',
      roleId: body.role_id ?? 0,
      callerRoleId: caller.roleId,
    });
    newSuccessResponse(req, res, 201, 'user pre-registered successfully', adminUserResponse(user));
  };

  /**
   * updateUserRole нь хэрэглэгчийн эрхийг солино. Дуудагчийн role нь usecase
   * руу ДАМЖИНА — энгийн admin нь зөвхөн manager ↔ user солино.
   *
   * PUT /admin/users/:id/role · Bearer + users.manage · 200 · 403 · 422
   */
  updateUserRole: AsyncHandler = async (req, res) => {
    const caller = currentUserFromRequest(req);
    if (!caller) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, updateRoleSchema);
    await this.users.updateRole(req.ctx, {
      userId: pathParam(req, 'id'),
      roleId: body.role_id,
      callerRoleId: caller.roleId,
    });
    newSuccessResponse(req, res, 200, 'user role updated successfully');
  };

  /** PUT /admin/users/:id/active · Bearer + users.manage · 200 · 422 */
  setUserActive: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, setActiveSchema);
    await this.users.setActive(req.ctx, { userId: pathParam(req, 'id'), active: body.active });
    newSuccessResponse(req, res, 200, 'user status updated successfully');
  };

  /** DELETE /admin/users/:id — зөөлөн устгал · Bearer + users.manage · 200 */
  deleteUser: AsyncHandler = async (req, res) => {
    await this.users.deleteUser(req.ctx, { userId: pathParam(req, 'id') });
    newSuccessResponse(req, res, 200, 'user deleted successfully');
  };
}

export const newAdminHandler = (users: UsersUsecase): AdminHandler => new AdminHandler(users);
