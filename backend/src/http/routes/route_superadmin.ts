// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { newSuperadminHandler } from '../handlers/v1/superadmin/superadmin_handler.js';
import { requireSuperAdmin } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerSuperadminRoutes нь /superadmin/* бүлгийг холбоно — админ удирдлага,
 * super admin урилга (allow-list) болон платформын хандалтын горим.
 *
 * Бүх route нь `requireSuperAdmin`-ээр хамгаалагдана: энгийн admin ч ХҮРЭХГҮЙ
 * (least-privilege). Энэ давхарга super admin зэрэглэлийг ХЭЗЭЭ Ч API-аар
 * үүсгэдэггүй — зөвхөн admin зэрэглэлийг олгож/хасна.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 */
export function registerSuperadminRoutes(router: Router, deps: Deps): void {
  const handler = newSuperadminHandler(deps.superadminUC);
  const auth = deps.authMiddleware;
  const su = requireSuperAdmin();

  const sa = Router();
  sa.get('/admins', auth, su, wrap(handler.listAdmins));
  sa.post('/admins', auth, su, wrap(handler.createAdmin));
  sa.get('/admins/by-register', auth, su, wrap(handler.lookupByRegister));
  sa.post('/admins/by-register', auth, su, wrap(handler.addAdminByRegister));
  sa.put('/admins/:id/grant', auth, su, wrap(handler.grantAdmin));
  sa.delete('/admins/:id', auth, su, wrap(handler.revokeAdmin));

  // Super admin урилга — урилга нь эрхийг ШУУД олгодоггүй, зөвхөн
  // onboarding шидтэнг эхлүүлэх хаалгыг нээнэ.
  sa.get('/invites', auth, su, wrap(handler.listInvites));
  sa.post('/invites', auth, su, wrap(handler.createInvite));
  sa.delete('/invites/:email', auth, su, wrap(handler.deleteInvite));

  // Платформын хандалтын горим (public|private) — зөвхөн super admin.
  sa.get('/access-mode', auth, su, wrap(handler.getAccessMode));
  sa.put('/access-mode', auth, su, wrap(handler.setAccessMode));

  router.use('/superadmin', sa);
}
