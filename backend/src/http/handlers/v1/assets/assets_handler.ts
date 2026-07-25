// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /me/* endpoint-ууд — гарын үсэг (хувь хүн), байгууллагын тамганы дардас,
// латин нэрийн засвар. Бүгд нэвтэрсэн хэрэглэгчийн ӨӨРИЙНХ НЬ нэрийн өмнөөс
// ажиллана: хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гардаг тул body/query-гээр өөр
// хүний ID дамжуулах боломжгүй.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { AssetsUsecase } from '../../../../usecases/assets/assets_usecase.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * assetUrlSchema нь гарын үсэг / тамганы зургийн (Google Drive) URL-ийг хадгалах
 * body. Зургийг клиент талд Drive-д байршуулж, энд зөвхөн URL дамжуулна.
 */
const assetUrlSchema = strictObject({
  url: z.string().url().max(1000),
});

/** latinNameSchema нь хэрэглэгчийн латин нэрийг гараар засах body. */
const latinNameSchema = strictObject({
  first_name_en: z.string().max(120).optional(),
  last_name_en: z.string().max(120).optional(),
});

/** orgNameLatinSchema нь байгууллагын латин нэрийг гараар засах body (ADMIN). */
const orgNameLatinSchema = strictObject({
  name_latin: z.string().max(200).optional(),
});

/** regNoParam нь :regNo path параметрийг мөр болгоно. */
function regNoParam(req: Request): string {
  const raw: unknown = req.params.regNo;
  return typeof raw === 'string' ? raw : '';
}

export class AssetsHandler {
  constructor(private readonly usecase: AssetsUsecase) {}

  /** GET /me/signature · Bearer · 200 */
  getSignature: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const url = await this.usecase.getSignature(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'signature fetched', { url });
  };

  /** PUT /me/signature · Bearer + write rate limit · 200 · 400 · 422 */
  setSignature: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, assetUrlSchema);
    await this.usecase.setSignature(req.ctx, user.id, body.url);
    newSuccessResponse(req, res, 200, 'signature saved', { url: body.url });
  };

  /** DELETE /me/signature · Bearer + write rate limit · 200 */
  deleteSignature: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    await this.usecase.deleteSignature(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'signature deleted', { url: '' });
  };

  /** PUT /me/latin-name · Bearer + write rate limit · 200 · 422 */
  setLatinName: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, latinNameSchema);
    await this.usecase.setLatinName(
      req.ctx,
      user.id,
      body.first_name_en ?? '',
      body.last_name_en ?? '',
    );
    newSuccessResponse(req, res, 200, 'latin name saved');
  };

  /**
   * setOrgNameLatin нь байгууллагын латин нэрийг засна. ADMIN эрхийг eID
   * (улсын бүртгэл) шалгана — эрхгүй бол 403.
   *
   * PUT /me/org-name-latin/:regNo · Bearer + write rate limit · 200 · 403 · 422
   */
  setOrgNameLatin: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, orgNameLatinSchema);
    await this.usecase.setOrgNameLatin(req.ctx, user.id, regNoParam(req), body.name_latin ?? '');
    newSuccessResponse(req, res, 200, 'org name latin saved');
  };

  /** GET /me/orgstamp/:regNo · Bearer · 200 · 403 (төлөөлөгч биш) */
  getStamp: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const url = await this.usecase.getStamp(req.ctx, user.id, regNoParam(req));
    newSuccessResponse(req, res, 200, 'stamp fetched', { url });
  };

  /** PUT /me/orgstamp/:regNo · Bearer + write rate limit · 200 · 403 (ADMIN биш) */
  setStamp: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, assetUrlSchema);
    await this.usecase.setStamp(req.ctx, user.id, regNoParam(req), body.url);
    newSuccessResponse(req, res, 200, 'stamp saved', { url: body.url });
  };

  /** DELETE /me/orgstamp/:regNo · Bearer + write rate limit · 200 · 403 */
  deleteStamp: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    await this.usecase.deleteStamp(req.ctx, user.id, regNoParam(req));
    newSuccessResponse(req, res, 200, 'stamp deleted', { url: '' });
  };
}

export const newAssetsHandler = (usecase: AssetsUsecase): AssetsHandler =>
  new AssetsHandler(usecase);
