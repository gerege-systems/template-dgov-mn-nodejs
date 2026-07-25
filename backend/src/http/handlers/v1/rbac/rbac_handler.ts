// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /rbac/* HTTP endpoint-ууд — динамик эрх (roles) + эрхийн каталог.

import { RoleAdmin, RoleUser } from '../../../../domain/users.js';
import type { CurrentUser } from '../../../../pkg/ctx/ctx.js';
import * as logger from '../../../../pkg/logger/logger.js';
import { recordEventSafely, type AuditUsecase } from '../../../../usecases/audit/audit_usecase.js';
import type { RBACUsecase } from '../../../../usecases/rbac/rbac_usecase.js';
import {
  createRoleSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from '../../../dto/requests/rbac.js';
import {
  permissionListResponse,
  roleListResponse,
  roleResponse,
} from '../../../dto/responses/rbac.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import {
  decodeBody,
  newAbortResponse,
  newErrorResponse,
  newSuccessResponse,
} from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * effectiveRoleId нь claim дахь roleId-г тодорхойлно. Хуучин токенд roleId
 * байхгүй (=0) байж болох тул admin флагаас, эс бөгөөс хамгийн бага эрхээс
 * гаргана.
 */
export function effectiveRoleId(user: CurrentUser): number {
  if (user.roleId !== 0) return user.roleId;
  return user.isAdmin ? RoleAdmin : RoleUser;
}

/**
 * roleIdParam нь :id path параметрийг бүхэл тоо болгоно. Тоо биш бол undefined —
 * дуудагч 404 буцаана (тоо биш ID нь "байхгүй" гэсэн үг).
 */
function roleIdParam(req: Request): number | undefined {
  // Express 5-д params нь массив байж болно (давхардсан :id) — тэр үед татгалзана.
  const raw: unknown = req.params.id;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) ? n : undefined;
}

export class RBACHandler {
  constructor(
    private readonly usecase: RBACUsecase,
    /** auditUC нь эрхийн өөрчлөлтийг бүртгэнэ; null бол алгасна. */
    private readonly auditUC: AuditUsecase | null = null,
  ) {}

  /**
   * myPermissions нь нэвтэрсэн хэрэглэгчийн ӨӨРИЙН эрхүүдийг буцаана — frontend
   * цэсээ шүүхэд хэрэглэнэ. Нэвтэрсэн хэрэглэгч БҮРТ нээлттэй.
   *
   * GET /rbac/me · Bearer · 200 string[] · 401
   */
  myPermissions: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const perms = await this.usecase.resolve(req.ctx, effectiveRoleId(user));
    newSuccessResponse(req, res, 200, 'permissions fetched successfully', perms);
  };

  /**
   * listRoles нь эрх бүрийг оноогдсон эрхүүдтэй нь буцаана (RBAC matrix).
   *
   * GET /rbac/roles · Bearer + roles.manage · 200
   */
  listRoles: AsyncHandler = async (req, res) => {
    const list = await this.usecase.listRoles(req.ctx);
    newSuccessResponse(req, res, 200, 'roles fetched successfully', roleListResponse(list));
  };

  /**
   * listPermissions нь эрхийн каталогийг буцаана.
   *
   * GET /rbac/permissions · Bearer + roles.manage · 200
   */
  listPermissions: AsyncHandler = async (req, res) => {
    const perms = await this.usecase.listPermissions(req.ctx);
    newSuccessResponse(
      req,
      res,
      200,
      'permissions fetched successfully',
      permissionListResponse(perms),
    );
  };

  /**
   * createRole нь шинэ (системийн БИШ) эрх үүсгэнэ. key хоосон бол name-ээс
   * slugify хийнэ.
   *
   * POST /rbac/roles · Bearer + roles.manage · 201 · 400 · 409 · 422
   */
  createRole: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, createRoleSchema);
    const role = await this.usecase.createRole(req.ctx, {
      key: body.key ?? '',
      name: body.name,
      description: body.description ?? '',
      permissions: body.permissions,
    });
    newSuccessResponse(req, res, 201, 'role created successfully', roleResponse(role));
  };

  /**
   * updateRole нь name/description-г шинэчилнэ (key болон is_system хөндөгдөхгүй).
   * permissions БАЙХГҮЙ бол эрхийг хөндөхгүй.
   *
   * PUT /rbac/roles/:id · Bearer + roles.manage · 200 · 404 · 422
   */
  updateRole: AsyncHandler = async (req, res) => {
    const id = roleIdParam(req);
    if (id === undefined) {
      newErrorResponse(req, res, 404, 'role not found');
      return;
    }
    const body = decodeBody(req, updateRoleSchema);
    const role = await this.usecase.updateRole(req.ctx, {
      id,
      name: body.name,
      description: body.description ?? '',
      permissions: body.permissions,
    });
    newSuccessResponse(req, res, 200, 'role updated successfully', roleResponse(role));
  };

  /**
   * setRolePermissions нь эрхийн багцыг БҮХЭЛД НЬ солино. Хоосон массив нь бүх
   * эрхийг хасна.
   *
   * PUT /rbac/roles/:id/permissions · Bearer + roles.manage · 200 · 400 · 404 · 422
   */
  setRolePermissions: AsyncHandler = async (req, res) => {
    const id = roleIdParam(req);
    if (id === undefined) {
      newErrorResponse(req, res, 404, 'role not found');
      return;
    }
    const body = decodeBody(req, setRolePermissionsSchema);
    const keys = body.permissions ?? [];
    await this.usecase.setRolePermissions(req.ctx, id, keys);

    // Эрхийн өөрчлөлт нь аюулгүй байдлын хувьд ЧУХАЛ үйлдэл тул бүртгэнэ.
    // Best-effort — бүртгэл унасан ч үйлдэл аль хэдийн хийгдсэн.
    await recordEventSafely(
      this.auditUC,
      req.ctx,
      'rbac.role.permissions.set',
      'rbac',
      String(id),
      { permission_count: keys.length },
      (err) => {
        logger.errorWithContext(req.ctx, 'audit write failed (non-fatal)', {
          controller: 'rbac',
          method: 'setRolePermissions',
          step: 'audit_record',
          error: logger.errText(err),
        });
      },
    );

    newSuccessResponse(req, res, 200, 'role permissions updated successfully');
  };

  /**
   * deleteRole нь эрхийг устгана. Системийн эрх болон ХЭРЭГЛЭГЧИД ОНООГДСОН эрх
   * устгагдахгүй (409).
   *
   * DELETE /rbac/roles/:id · Bearer + roles.manage · 200 · 404 · 409
   */
  deleteRole: AsyncHandler = async (req, res) => {
    const id = roleIdParam(req);
    if (id === undefined) {
      newErrorResponse(req, res, 404, 'role not found');
      return;
    }
    await this.usecase.deleteRole(req.ctx, id);
    newSuccessResponse(req, res, 200, 'role deleted successfully');
  };
}

export function newRBACHandler(
  usecase: RBACUsecase,
  auditUC: AuditUsecase | null = null,
): RBACHandler {
  return new RBACHandler(usecase, auditUC);
}
