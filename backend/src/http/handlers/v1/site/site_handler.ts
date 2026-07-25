// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /site/* болон /themes/* HTTP endpoint-ууд — сайтын нийтийн харагдац болон
// landing-ийн нэрлэсэн загварууд.
//
// АНХААР: `GET /site/appearance` болон `GET /themes/active` нь НЭВТРЭЛТГҮЙ —
// нэвтрээгүй зочны landing тэднийг уншдаг. Бусад бүх endpoint нь
// `settings.manage` эрх шаардана.

import { z } from 'zod';

import type { SiteAppearance } from '../../../../domain/site.js';
import type { SiteUsecase, ThemeUsecase } from '../../../../usecases/site/site_usecase.js';
import { strictObject } from '../../../../pkg/validators/validators.js';
import {
  siteAppearanceResponse,
  themeListResponse,
  themeResponse,
} from '../../../dto/responses/site.js';
import { decodeBody, newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * siteAppearanceSchema нь сайтын харагдацыг шинэчлэх админ хүсэлт. accent нь
 * preset нэр эсвэл '#rrggbb' hex — УТГЫН нарийн шалгалт usecase давхаргад
 * (domain.validSiteAccent г.м.), энд зөвхөн хэлбэр/урт.
 */
const siteAppearanceSchema = strictObject({
  accent: z.string().min(1).max(32),
  font: z.string().min(1).max(16),
  style: z.string().min(1).max(16),
  theme: z.string().min(1).max(16),
});

/**
 * themeUpsertSchema нь theme үүсгэх/шинэчлэх админ хүсэлт. config нь ЧӨЛӨӨТ
 * JSONB — нарийн шалгалт domain.validateThemeConfig-д.
 */
const themeUpsertSchema = strictObject({
  name: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()).optional(),
});

/** themeIdParam нь :id path параметрийг мөр болгоно (массив/undefined → ""). */
function themeIdParam(req: Request): string {
  const raw: unknown = req.params.id;
  return typeof raw === 'string' ? raw : '';
}

export class SiteHandler {
  constructor(private readonly usecase: SiteUsecase) {}

  /**
   * getAppearance нь сайтын харагдацын default-ыг буцаана. НЭВТРЭЛТГҮЙ —
   * нэвтрээгүй зочны landing уншдаг.
   *
   * GET /site/appearance · 200
   */
  getAppearance: AsyncHandler = async (req, res) => {
    const a = await this.usecase.getAppearance(req.ctx);
    newSuccessResponse(req, res, 200, 'site appearance fetched', siteAppearanceResponse(a));
  };

  /**
   * setAppearance нь харагдацын default-ыг шинэчилнэ.
   *
   * PUT /site/appearance · Bearer + settings.manage · 200 · 400 · 422
   */
  setAppearance: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, siteAppearanceSchema);
    const next: SiteAppearance = {
      accent: body.accent,
      font: body.font,
      style: body.style,
      theme: body.theme,
      updatedAt: null,
    };
    await this.usecase.setAppearance(req.ctx, next);
    newSuccessResponse(req, res, 200, 'site appearance updated');
  };
}

export class ThemeHandler {
  constructor(private readonly usecase: ThemeUsecase) {}

  /**
   * getActive нь идэвхтэй theme-ийг буцаана. НЭВТРЭЛТГҮЙ — landing уншдаг.
   *
   * GET /themes/active · 200 · 404
   */
  getActive: AsyncHandler = async (req, res) => {
    const t = await this.usecase.getActive(req.ctx);
    newSuccessResponse(req, res, 200, 'active theme fetched', themeResponse(t));
  };

  /** GET /themes · Bearer + settings.manage · 200 */
  list: AsyncHandler = async (req, res) => {
    const list = await this.usecase.list(req.ctx);
    newSuccessResponse(req, res, 200, 'themes fetched', themeListResponse(list));
  };

  /** GET /themes/:id · Bearer + settings.manage · 200 · 404 */
  get: AsyncHandler = async (req, res) => {
    const t = await this.usecase.get(req.ctx, themeIdParam(req));
    newSuccessResponse(req, res, 200, 'theme fetched', themeResponse(t));
  };

  /** POST /themes · Bearer + settings.manage · 201 · 400 · 422 */
  create: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, themeUpsertSchema);
    const t = await this.usecase.create(req.ctx, body.name, body.config ?? {});
    newSuccessResponse(req, res, 201, 'theme created', themeResponse(t));
  };

  /** PUT /themes/:id · Bearer + settings.manage · 200 · 400 · 404 · 422 */
  update: AsyncHandler = async (req, res) => {
    const id = themeIdParam(req);
    if (id === '') {
      newErrorResponse(req, res, 404, 'theme not found');
      return;
    }
    const body = decodeBody(req, themeUpsertSchema);
    await this.usecase.update(req.ctx, id, body.name, body.config ?? {});
    newSuccessResponse(req, res, 200, 'theme updated');
  };

  /**
   * deleteTheme нь theme-ийг устгана. ИДЭВХТЭЙ theme устгагдахгүй (400) —
   * landing эх сурвалжгүй болно.
   *
   * DELETE /themes/:id · Bearer + settings.manage · 200 · 400 · 404
   */
  deleteTheme: AsyncHandler = async (req, res) => {
    await this.usecase.deleteTheme(req.ctx, themeIdParam(req));
    newSuccessResponse(req, res, 200, 'theme deleted');
  };

  /** PUT /themes/:id/active · Bearer + settings.manage · 200 · 404 */
  setActive: AsyncHandler = async (req, res) => {
    await this.usecase.setActive(req.ctx, themeIdParam(req));
    newSuccessResponse(req, res, 200, 'theme activated');
  };
}

export const newSiteHandler = (usecase: SiteUsecase): SiteHandler => new SiteHandler(usecase);
export const newThemeHandler = (usecase: ThemeUsecase): ThemeHandler => new ThemeHandler(usecase);
