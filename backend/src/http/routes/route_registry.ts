// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Router } from 'express';

import { PermRegistryManage, PermRegistryView } from '../../domain/rbac.js';
import { newRegistryHandler } from '../handlers/v1/registry/registry_handler.js';
import { requirePermission } from '../middlewares/rbac.js';
import { wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerRegistryRoutes нь /registry/* (админ) болон /catalog/* (иргэн)
 * бүлгүүдийг холбоно — Ring System · R1, үйлчилгээний нэгдсэн регистр.
 *
 * • /registry/* — уншилт `registry.view`, бичилт `registry.manage`.
 * • /catalog/*  — ТУСГАЙ ЭРХ ШААРДАХГҮЙ (нэвтэрсэн дурын иргэн). Оронд нь
 *   usecase давхарга ЗӨВХӨН нийтлэгдсэн паспортыг эргүүлдэг — ноорог,
 *   архивласан бичлэг энэ гадаргуугаар ХЭЗЭЭ Ч гарахгүй.
 *
 * Middleware-ийг route ТУС БҮРД ил дамжуулна (route_auth.ts дахь тайлбарыг үз).
 * ⚠️ `/services/:id/...` дэд замуудыг `/services/:id`-ээс ӨМНӨ бүртгэх
 * шаардлагагүй — Express нь бүрэн замаар тааруулдаг (chi-ээс ялгаатай).
 */
export function registerRegistryRoutes(router: Router, deps: Deps): void {
  const handler = newRegistryHandler(deps.registryUC);
  const auth = deps.authMiddleware;
  const view = requirePermission(deps.rbacUC, PermRegistryView);
  const manage = requirePermission(deps.rbacUC, PermRegistryManage);

  const registry = Router();

  // ── Уншилт (registry.view) ──────────────────────────────────────────
  registry.get('/overview', auth, view, wrap(handler.overview));
  registry.get('/catalog', auth, view, wrap(handler.catalog));
  registry.get('/once-only', auth, view, wrap(handler.onceOnlyViolations));
  registry.get('/services', auth, view, wrap(handler.listServices));
  registry.get('/services/:id', auth, view, wrap(handler.getService));
  registry.get('/services/:id/versions', auth, view, wrap(handler.listVersions));
  registry.get('/services/:id/once-only', auth, view, wrap(handler.checkOnceOnly));
  registry.get('/evidences', auth, view, wrap(handler.listEvidences));
  registry.get('/life-events', auth, view, wrap(handler.listLifeEvents));

  // ── Бичилт (registry.manage) ────────────────────────────────────────
  registry.post('/services', auth, manage, wrap(handler.createService));
  registry.put('/services/:id', auth, manage, wrap(handler.updateService));
  registry.delete('/services/:id', auth, manage, wrap(handler.deleteService));
  registry.post('/services/:id/archive', auth, manage, wrap(handler.archiveService));
  registry.put('/services/:id/evidences', auth, manage, wrap(handler.setEvidences));
  registry.post('/services/:id/publish', auth, manage, wrap(handler.publish));

  registry.post('/evidences', auth, manage, wrap(handler.createEvidence));
  registry.put('/evidences/:id', auth, manage, wrap(handler.updateEvidence));
  registry.delete('/evidences/:id', auth, manage, wrap(handler.deleteEvidence));

  registry.post('/life-events', auth, manage, wrap(handler.createLifeEvent));
  registry.delete('/life-events/:id', auth, manage, wrap(handler.deleteLifeEvent));

  router.use('/registry', registry);

  // ── Иргэн рүү харсан нийтийн каталог (зөвхөн уншилт) ────────────────
  const catalog = Router();
  catalog.get('/services', auth, wrap(handler.catalog));
  catalog.get('/services/:id', auth, wrap(handler.publicService));
  catalog.get('/life-events', auth, wrap(handler.publicLifeEvents));
  router.use('/catalog', catalog);
}
