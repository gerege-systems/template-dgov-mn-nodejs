// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Гуравдагч талын интеграцийн (Google Drive · Dropbox · Google Meet) OAuth
// урсгал болон файлын үйлдлүүд.
//
// ⚠️ ЯАГААД ЭНЭ НЬ API ДЭЭР БАЙНА ВЭ: SPA нь nginx-ээр СТАТИКААР түгээгддэг тул
// ямар ч нууц (client_secret) агуулж чадахгүй бөгөөд хэрэглэгчийн OAuth токен
// browser-т хүрэх ёсгүй. Тиймээс authorize руу чиглүүлэх, code солилцох, токен
// шинэчлэх, провайдерын API дуудах бүхэн ЭНД хийгдэнэ. Go эх хувилбарт эдгээр
// нь Next.js BFF-д байсан — SPA болгоход тэр давхарга алга болсон тул үйлдлүүд
// API руу нүүсэн (HTTP гэрээ нь өргөжсөн; хуучин endpoint-ууд хэвээр).

import { randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { appOrigin } from '../../../../config/config.js';
import { badRequest } from '../../../../apperror/index.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import * as logger from '../../../../pkg/logger/logger.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getProvider,
  isConfigured,
  type OAuthProvider,
} from '../../../../pkg/oauthproviders/oauthproviders.js';
import { strictObject } from '../../../../pkg/validators/validators.js';
import type { IntegrationsUsecase } from '../../../../usecases/integrations/integrations_usecase.js';
import {
  uploadMaxBytes,
  type ProviderOps,
} from '../../../../usecases/integrations/integrations_provider.js';
import {
  clearOAuthStateCookie,
  oauthStateCookie,
  readCookies,
  setOAuthStateCookie,
} from '../../../cookies.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { decodeBody, newAbortResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

const controllerName = 'integrations';
const fileName = 'integrations_oauth_handler.ts';

/** integrationsPage нь SPA дээрх холболтын хуудас — callback эцэст энд буцна. */
const integrationsPage = '/me/integrations';

/**
 * uploadSchema нь base64 биетэй файл хуулах body. Multipart биш base64 —
 * ImageUploadCard нь зургийг FileReader-ээр base64 болгодог ба ингэснээр
 * хүсэлтийн биеийн ерөнхий JSON хязгаар (bodySizeLimit) хэвээр үйлчилнэ.
 */
const uploadSchema = strictObject({
  /** data нь base64 (data: угтваргүй). */
  data: z.string().min(1),
  mime: z.string().max(255).optional(),
  name: z.string().max(255).optional(),
});

/** renameSchema нь Drive файлын нэр солих body. */
const renameSchema = strictObject({
  name: z.string().min(1).max(255),
});

/** driveFileIdPattern нь Drive-ийн файлын ID-ийн хэлбэр (зам тарааж болохгүй). */
const driveFileIdPattern = /^[A-Za-z0-9_-]{8,}$/;

/** decodeBase64 нь base64 мөрийг Buffer болгоно (хэмжээг ил барина). */
function decodeBase64(data: string): Buffer {
  const buf = Buffer.from(data, 'base64');
  if (buf.length === 0) throw badRequest('зураг/файл хоосон байна');
  if (buf.length > uploadMaxBytes) throw badRequest('файл хэт том байна');
  return buf;
}

/** providerParam нь :provider path параметрийг мөр болгоно. */
function providerParam(req: Request): string {
  const raw: unknown = req.params.provider;
  return typeof raw === 'string' ? raw : '';
}

/** fileIdParam нь :id path параметрийг мөр болгоно. */
function fileIdParam(req: Request): string {
  const raw: unknown = req.params.id;
  return typeof raw === 'string' ? raw : '';
}

/** sameToken нь state-ийг тогтмол хугацаанд харьцуулна (fail-closed). */
function sameToken(a: string, b: string): boolean {
  if (a === '' || b === '' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class IntegrationsOAuthHandler {
  constructor(
    private readonly integrations: IntegrationsUsecase,
    private readonly ops: ProviderOps,
  ) {}

  /**
   * connect нь OAuth урсгалыг эхлүүлж, провайдерын зөвшөөрлийн хуудас руу 302
   * хийнэ. CSRF-ийн state-ийг богино настай httpOnly cookie-д хадгална.
   *
   * Энэ бол top-level navigation (browser хаягийн мөрөөр явна) тул хариу нь
   * JSON биш REDIRECT — SameSite=Lax cookie-ууд ирж, authMiddleware хэрэглэгчийг
   * танина.
   *
   * GET /integrations/:provider/connect · cookie session · 302
   */
  connect: AsyncHandler = (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return Promise.resolve();
    }
    const origin = appOrigin();
    const back = (q: string): void => {
      res.redirect(`${origin}${integrationsPage}?${q}`);
    };

    const p = getProvider(providerParam(req));
    if (!p) {
      back('error=unknown_provider');
      return Promise.resolve();
    }
    if (origin === '') {
      // APP_ORIGIN тохируулаагүй бол redirect_uri-г найдвартай угсарч чадахгүй.
      logger.errorWithContext(req.ctx, 'integrations connect: APP_ORIGIN is not configured', {
        controller: controllerName,
        file: fileName,
        method: 'connect',
        provider: p.id,
      });
      res.redirect(`${integrationsPage}?error=not_configured&provider=${p.id}`);
      return Promise.resolve();
    }
    if (!isConfigured(p)) {
      back(`error=not_configured&provider=${p.id}`);
      return Promise.resolve();
    }

    const state = randomBytes(16).toString('hex');
    setOAuthStateCookie(res, p.id, state);
    res.redirect(buildAuthorizeUrl(p, origin, state));
    return Promise.resolve();
  };

  /**
   * callback нь провайдерын буцах цэг: state-ийг cookie-той тулгаж (CSRF),
   * code-ийг токен болгон солилцоод, ШИФРЛҮҮЛЭН хадгална. Дараа нь SPA-ийн
   * холболтын хуудас руу буцаана — токен browser-т ХЭЗЭЭ Ч хүрэхгүй.
   *
   * GET /integrations/:provider/callback · cookie session · 302
   */
  callback: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const origin = appOrigin();
    const p = getProvider(providerParam(req));
    const back = (q: string): void => {
      res.redirect(`${origin}${integrationsPage}?${q}`);
    };

    if (!p) {
      back('error=unknown_provider');
      return;
    }
    clearOAuthStateCookie(res, p.id);

    // Провайдер зөвшөөрлийг цуцалбал error параметр буцаана.
    if (typeof req.query.error === 'string' && req.query.error !== '') {
      back(`error=denied&provider=${p.id}`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expected = readCookies(req)[oauthStateCookie(p.id)] ?? '';
    if (code === '' || !sameToken(state, expected)) {
      back(`error=invalid_state&provider=${p.id}`);
      return;
    }

    try {
      await this.storeToken(req.ctx, user.id, p, origin, code);
    } catch (err) {
      logger.errorWithContext(req.ctx, 'integration oauth callback failed', {
        controller: controllerName,
        file: fileName,
        method: 'callback',
        step: 'exchange_and_store',
        provider: p.id,
        error: logger.errText(err),
      });
      back(`error=exchange_failed&provider=${p.id}`);
      return;
    }
    back(`connected=${p.id}`);
  };

  /** storeToken нь code-ийг токен болгож солилцоод хадгална. */
  private async storeToken(
    ctx: Ctx,
    userId: string,
    p: OAuthProvider,
    origin: string,
    code: string,
  ): Promise<void> {
    const token = await exchangeCodeForToken(p, origin, code);
    await this.integrations.connect(ctx, {
      userId,
      provider: p.id,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt > 0 ? new Date(token.expiresAt) : null,
    });
  }

  // ────────────────────────── Google Drive ──────────────────────────

  /** GET /integrations/google-drive/files · Bearer/cookie · 200 · 400 */
  driveFiles: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const files = await this.ops.driveList(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'drive files fetched', files);
  };

  /** POST /integrations/google-drive/upload · Bearer/cookie · 200 · 400 · 422 */
  driveUpload: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, uploadSchema);
    const file = await this.ops.driveUploadFile(
      req.ctx,
      user.id,
      body.name ?? 'file',
      body.mime ?? 'application/octet-stream',
      decodeBase64(body.data),
    );
    newSuccessResponse(req, res, 200, 'file uploaded', file);
  };

  /**
   * driveImage нь зургийг Drive-д хуулж НИЙТЭД харагдах URL буцаана. Гарын
   * үсэг/тамгыг хадгалахдаа SPA эхлээд үүнийг дуудаж URL авна, дараа нь тэр
   * URL-ийг `PUT /me/signature` (эсвэл `/me/orgstamp/:regNo`) рүү илгээнэ —
   * assets-ийн HTTP гэрээ (URL хадгалдаг) 1:1 хэвээр үлдэнэ.
   *
   * POST /integrations/google-drive/image · Bearer/cookie · 200 · 400 · 422
   */
  driveImage: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, uploadSchema);
    const url = await this.ops.driveUploadImage(
      req.ctx,
      user.id,
      body.name ?? 'image.png',
      body.mime ?? 'image/png',
      decodeBase64(body.data),
    );
    newSuccessResponse(req, res, 200, 'image uploaded', { url });
  };

  /** PUT /integrations/google-drive/files/:id · Bearer/cookie · 200 · 400 · 422 */
  driveRename: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const fileId = fileIdParam(req);
    if (!driveFileIdPattern.test(fileId)) throw badRequest('файлын ID буруу байна');
    const body = decodeBody(req, renameSchema);
    const file = await this.ops.driveRenameFile(req.ctx, user.id, fileId, body.name.trim());
    newSuccessResponse(req, res, 200, 'file renamed', file);
  };

  /** DELETE /integrations/google-drive/files/:id · Bearer/cookie · 200 · 400 */
  driveDelete: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const fileId = fileIdParam(req);
    if (!driveFileIdPattern.test(fileId)) throw badRequest('файлын ID буруу байна');
    await this.ops.driveDeleteFile(req.ctx, user.id, fileId);
    newSuccessResponse(req, res, 200, 'file deleted');
  };

  // ─────────────────────────────  Dropbox ─────────────────────────────

  /** GET /integrations/dropbox/files · Bearer/cookie · 200 · 400 */
  dropboxFiles: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const files = await this.ops.dropboxListFiles(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'dropbox files fetched', files);
  };

  /** GET /integrations/dropbox/preview?path=… · Bearer/cookie · 200 · 400 */
  dropboxPreview: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const link = await this.ops.dropboxPreviewLink(req.ctx, user.id, path);
    newSuccessResponse(req, res, 200, 'preview link fetched', { link });
  };

  /** POST /integrations/dropbox/upload · Bearer/cookie · 200 · 400 · 422 */
  dropboxUpload: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, uploadSchema);
    const meta = await this.ops.dropboxUploadFile(
      req.ctx,
      user.id,
      body.name ?? 'file',
      decodeBase64(body.data),
    );
    newSuccessResponse(req, res, 200, 'file uploaded', meta);
  };

  // ─────────────────────────── Google Meet ───────────────────────────

  /** POST /integrations/google-meet/create-space · Bearer/cookie · 200 · 400 */
  meetCreateSpace: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const space = await this.ops.meetCreate(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'meet space created', space);
  };
}

export const newIntegrationsOAuthHandler = (
  integrations: IntegrationsUsecase,
  ops: ProviderOps,
): IntegrationsOAuthHandler => new IntegrationsOAuthHandler(integrations, ops);
