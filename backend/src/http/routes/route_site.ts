// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermSettingsManage } from '../../domain/rbac.js';
import { newSiteHandler, newThemeHandler } from '../handlers/v1/site/site_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerSiteRoutes нь /site/* болон /themes/* бүлгүүдийг холбоно.
 *
 * ⚠️ НЭВТРЭЛТГҮЙ хоёр endpoint БАЙНА: `GET /site/appearance` болон
 * `GET /themes/active`. Нэвтрээгүй зочны landing тэднийг уншдаг тул gate тавьж
 * БОЛОХГҮЙ — тавибал нүүр хуудас хоосон гарна. Бусад бүх endpoint нь
 * authMiddleware + `settings.manage`.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (Express-ийн `use()` нь бүлгээр
 * хязгаарлагддаггүй — route_auth.ts дахь тайлбарыг үз).
 */
export function registerSiteRoutes(router: Router, deps: Deps): void {
  const site = newSiteHandler(deps.siteUC);
  const theme = newThemeHandler(deps.themeUC);
  const manage = requirePermission(deps.rbacUC, PermSettingsManage);

  const siteRouter = Router();
  // НЭВТРЭЛТГҮЙ — landing уншина.
  siteRouter.get('/appearance', wrap(site.getAppearance));
  siteRouter.put('/appearance', deps.authMiddleware, manage, wrap(site.setAppearance));
  router.use('/site', siteRouter);

  const themeRouter = Router();
  // НЭВТРЭЛТГҮЙ — landing SSR уншина.
  themeRouter.get('/active', wrap(theme.getActive));
  themeRouter.get('/', deps.authMiddleware, manage, wrap(theme.list));
  themeRouter.post('/', deps.authMiddleware, manage, wrap(theme.create));
  themeRouter.get('/:id', deps.authMiddleware, manage, wrap(theme.get));
  themeRouter.put('/:id', deps.authMiddleware, manage, wrap(theme.update));
  themeRouter.delete('/:id', deps.authMiddleware, manage, wrap(theme.deleteTheme));
  themeRouter.put('/:id/active', deps.authMiddleware, manage, wrap(theme.setActive));
  router.use('/themes', themeRouter);
}
