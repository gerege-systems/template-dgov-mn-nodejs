// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { RoleSuperAdmin, RoleUser } from '../../domain/users.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { newErrorResponse } from '../response.js';
import type { Middleware } from '../types.js';
import { currentUserFromRequest } from './auth.js';

/**
 * PermissionResolver нь нэг role-ийн эрхүүдийг буцаана (rbac usecase үүнийг
 * хангадаг). Энд interface болгож тодорхойлсон нь import cycle-ээс сэргийлж,
 * middleware-ийг RBAC хэрэгжилтээс салгана.
 */
export interface PermissionResolver {
  resolve(ctx: Ctx, roleId: number): Promise<string[]>;
}

/**
 * requirePermission нь тухайн эрхгүй хэрэглэгчийг 403-аар татгалзана. Auth
 * middleware-ийн ДАРАА ажиллах ёстой (currentUser байх ёстой). admin (isAdmin)
 * бүх шалгалтыг давна. resolve алдаа гарвал fail-closed (403).
 */
export function requirePermission(resolver: PermissionResolver, perm: string): Middleware {
  return (req, res, next) => {
    void (async () => {
      const user = currentUserFromRequest(req);
      if (!user) {
        newErrorResponse(req, res, 401, 'invalid token');
        return;
      }
      if (user.isAdmin) {
        next();
        return;
      }
      // Хуучин токенд roleId байхгүй (=0) — хамгийн бага эрх (RoleUser) гэж
      // үзнэ. Тогтмолыг ашигласнаар role ID-ийн дугаарлалт өөрчлөгдөхөд
      // автоматаар дагана.
      const roleId = user.roleId === 0 ? RoleUser : user.roleId;
      let perms: string[];
      try {
        perms = await resolver.resolve(req.ctx, roleId);
      } catch {
        newErrorResponse(req, res, 403, "you don't have access for this action");
        return;
      }
      if (perms.includes(perm)) {
        next();
        return;
      }
      newErrorResponse(req, res, 403, "you don't have access for this action");
    })();
  };
}

/**
 * requireAdmin нь зөвхөн admin (isAdmin) хэрэглэгчид route-д хандахыг зөвшөөрөх
 * declarative authorization middleware юм. Auth middleware-ийн ДАРАА ажиллах
 * ёстой — баталгаажсан claim (currentUser) байх шаардлагатай.
 *
 * Хариу:
 *   - claim байхгүй (auth middleware суулгаагүй / токен дээд урсгалд
 *     татгалзагдсан) → 401.
 *   - admin биш → 403 (fail-closed).
 *   - admin → next.
 */
export function requireAdmin(): Middleware {
  return (req, res, next) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newErrorResponse(req, res, 401, 'invalid token');
      return;
    }
    if (!user.isAdmin) {
      newErrorResponse(req, res, 403, "you don't have access for this action");
      return;
    }
    next();
  };
}

/**
 * requireSuperAdmin нь зөвхөн super admin (RoleSuperAdmin) хэрэглэгчид route-д
 * хандахыг зөвшөөрөх declarative authorization middleware юм. /superadmin
 * гадаргуу — админ хэрэглэгчдийг үүсгэх/эрх олгох/хасах — үүгээр хамгаалагдана.
 *
 * Энгийн admin (RoleAdmin) ч энэ gate-ийг давахгүй — least-privilege: зөвхөн
 * super admin л админ түвшний бүртгэлүүдийг удирдана.
 */
export function requireSuperAdmin(): Middleware {
  return (req, res, next) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newErrorResponse(req, res, 401, 'invalid token');
      return;
    }
    if (user.roleId !== RoleSuperAdmin) {
      newErrorResponse(req, res, 403, "you don't have access for this action");
      return;
    }
    next();
  };
}
