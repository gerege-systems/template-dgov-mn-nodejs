// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { withOfficer, withService } from '../../pkg/ctx/ctx.js';
import type { Middleware } from '../types.js';
import { currentUserFromRequest } from './auth.js';

/**
 * serviceRLSContext нь хүсэлтийн ctx-г RLS-ийн "service" үүргээр тэмдэглэнэ.
 * Нэвтрэхээс өмнөх auth урсгалууд (register / login / OTP / нууц үг сэргээх) нь
 * хараахан баталгаажаагүй хэрэглэгчийн мөрд хандах шаардлагатай тул энэ
 * middleware-г тухайн route бүлэгт суулгана.
 *
 * Auth middleware суусан route дээр (жишээ /auth/password/change) түүний тогтоосон
 * user/admin identity нь дараа нь ажиллаж энэ "service"-г дарж бичдэг тул
 * баталгаажсан үйлдлүүд хатуу хэвээр (least-privilege) үлддэг.
 */
export function serviceRLSContext(): Middleware {
  return (req, _res, next) => {
    req.ctx = withService(req.ctx);
    next();
  };
}

/**
 * officerRLSContext нь хүсэлтийн RLS үүргийг "officer" болгож ӨРГӨТГӨНӨ —
 * иргэний хүсэлт хянадаг менежер бусад хүний мөрийг харах шаардлагатай.
 *
 * ЗӨВХӨН officer route-уудад (requirePermission(gov.review)-ийн ДАРАА) суулгана.
 * Глобалаар суулгаж БОЛОХГҮЙ: 'officer' нь users зэрэг хүснэгтэд бодлогогүй тул
 * менежер өөрийн профайлаа ч харахаа болино.
 *
 * Admin-ыг ХӨНДӨХГҮЙ — RoleAdmin аль хэдийн бүх gov бодлогод багтдаг тул доош нь
 * "officer" болгох нь эрхийг нь хумих байсан.
 */
export function officerRLSContext(): Middleware {
  return (req, _res, next) => {
    const user = currentUserFromRequest(req);
    if (!user || user.isAdmin) {
      next();
      return;
    }
    req.ctx = withOfficer(req.ctx, user.id);
    next();
  };
}
