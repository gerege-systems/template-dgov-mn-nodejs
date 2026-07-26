// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newAuditHandler } from '../handlers/v1/audit/audit_handler.js';
import { requireAdmin } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerAuditRoutes нь /audit/* бүлгийг холбоно. БҮХ endpoint нэвтрэлт + admin
 * шаардана — audit бүртгэл нь хэн ямар үйлдэл хийснийг агуулдаг тул энгийн
 * хэрэглэгчид харагдах ёсгүй.
 *
 * Бүлгийн бүх route ижил gate-тэй тул `use()` нь энд ЗӨВ (route_auth.ts шиг
 * middleware-ийн хүрээ хольцолдох эрсдэлгүй).
 */
export function registerAuditRoutes(router: Router, deps: Deps): void {
  const handler = newAuditHandler(deps.auditUC);

  const audit = Router();
  audit.use(deps.authMiddleware);
  audit.use(requireAdmin());

  audit.get('/', wrap(handler.list));
  audit.get('/verify', wrap(handler.verify));

  router.use('/audit', audit);
}
