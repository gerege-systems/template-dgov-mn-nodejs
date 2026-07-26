// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /applications/* endpoint-ууд — API Gateway consumer + SSO RP-ийг нэгтгэсэн
// апп-ын админ гадаргуу. Бүгд `gateway.manage` эрх шаардана (route файлыг үз).
//
// ⚠️ client_secret нь ЗӨВХӨН create / rotate-secret / set-secret хариунд НЭГ
// удаа буцна — DB-д зөвхөн Argon2id hash хадгалагдана.

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { ApplicationsUsecase } from '../../../../usecases/applications/applications_usecase.js';
import {
  applicationListResponse,
  applicationResponse,
} from '../../../dto/responses/application.js';
import { decodeBody, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * applicationSchema нь апп үүсгэх/шинэчлэх body. redirect_uri-ийн НАРИЙН
 * шалгалт (https / loopback / fragment-гүй) нь usecase давхаргад.
 */
const applicationSchema = strictObject({
  name: z.string().min(1).max(128),
  app_type: z.enum(['web', 'spa', 'native', 'm2m']),
  redirect_uris: z.array(z.string().max(400)).optional(),
  tags: z.array(z.string().max(40)).optional(),
  service_ids: z.array(z.string().uuid()).optional(),
  enabled: z.boolean().optional(),
});

/** secretSchema нь client_secret-ыг ГАРААР оноох хүсэлт (rotate биш). */
const secretSchema = strictObject({
  secret: z.string().min(16).max(128),
});

const servicesSchema = strictObject({
  service_ids: z.array(z.string().uuid()).optional(),
});

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

type AppBody = z.infer<typeof applicationSchema>;

const toInput = (b: AppBody) => ({
  name: b.name,
  appType: b.app_type,
  redirectUris: b.redirect_uris ?? [],
  tags: b.tags ?? [],
  serviceIds: b.service_ids ?? [],
  enabled: b.enabled ?? true,
});

export class ApplicationsHandler {
  constructor(private readonly usecase: ApplicationsUsecase) {}

  /** GET /applications · Bearer + gateway.manage · 200 */
  list: AsyncHandler = async (req, res) => {
    const apps = await this.usecase.list(req.ctx);
    newSuccessResponse(req, res, 200, 'applications fetched', applicationListResponse(apps));
  };

  /** GET /applications/:id · Bearer + gateway.manage · 200 · 404 */
  get: AsyncHandler = async (req, res) => {
    const app = await this.usecase.get(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'application fetched', applicationResponse(app));
  };

  /**
   * create нь апп + OAuth2 client үүсгэнэ. Confidential (web/m2m) апп-ын
   * client_secret хариунд НЭГ удаа орно.
   *
   * POST /applications · Bearer + gateway.manage · 201 · 400 · 409 · 422
   */
  create: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, applicationSchema);
    const app = await this.usecase.create(req.ctx, toInput(body));
    newSuccessResponse(req, res, 201, 'application created', applicationResponse(app));
  };

  /** PUT /applications/:id · Bearer + gateway.manage · 200 · 400 · 404 · 422 */
  update: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, applicationSchema);
    const app = await this.usecase.update(req.ctx, pathParam(req, 'id'), toInput(body));
    newSuccessResponse(req, res, 200, 'application updated', applicationResponse(app));
  };

  /** DELETE /applications/:id · Bearer + gateway.manage · 200 (идемпотент) */
  deleteApp: AsyncHandler = async (req, res) => {
    await this.usecase.deleteApp(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'application deleted');
  };

  /** POST /applications/:id/rotate-secret · Bearer + gateway.manage · 200 · 400 · 404 */
  rotateSecret: AsyncHandler = async (req, res) => {
    const app = await this.usecase.rotateSecret(req.ctx, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'client secret rotated', applicationResponse(app));
  };

  /** PUT /applications/:id/secret · Bearer + gateway.manage · 200 · 400 · 404 · 422 */
  setSecret: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, secretSchema);
    const app = await this.usecase.setSecret(req.ctx, pathParam(req, 'id'), body.secret);
    newSuccessResponse(req, res, 200, 'client secret updated', applicationResponse(app));
  };

  /** PUT /applications/:id/services · Bearer + gateway.manage · 200 · 400 · 404 · 422 */
  setServices: AsyncHandler = async (req, res) => {
    const body = decodeBody(req, servicesSchema);
    const app = await this.usecase.setServices(
      req.ctx,
      pathParam(req, 'id'),
      body.service_ids ?? [],
    );
    newSuccessResponse(req, res, 200, 'application services updated', applicationResponse(app));
  };
}

export const newApplicationsHandler = (usecase: ApplicationsUsecase): ApplicationsHandler =>
  new ApplicationsHandler(usecase);
