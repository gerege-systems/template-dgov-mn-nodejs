// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// /gspace/* endpoint-ууд — хэрэглэгч өөрийн файлаа жагсаах/оруулах/татах/устгах.
// Хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гардаг тул өөр хүний хавтас руу хандах
// боломжгүй (client давхаргад замын сегмент бас ариутгагдана).

import { z } from 'zod';

import { strictObject } from '../../../../pkg/validators/validators.js';
import type { GSpaceUsecase } from '../../../../usecases/gspace/gspace_usecase.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import {
  decodeBody,
  newAbortResponse,
  newErrorResponse,
  newSuccessResponse,
} from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/**
 * uploadSchema — файл base64-ээр JSON body дотор ирнэ. Бодит хэмжээ/квотыг
 * usecase шалгана; энд зөвхөн хэлбэр.
 */
const uploadSchema = strictObject({
  name: z.string().min(1).max(200),
  data: z.string().min(1),
});

/** queryName нь ?name= query-г мөр болгоно. */
function queryName(req: Request): string {
  const raw: unknown = req.query.name;
  return typeof raw === 'string' ? raw : '';
}

/**
 * contentDisposition нь UTF-8 файлын нэрийг RFC 5987 дагуу зөв дамжуулна:
 * ASCII fallback + `filename*` (кирилл нэр гацахгүй). Хяналтын тэмдэгт болон
 * хашилтыг `_` болгоно — header тарааж эвдэхээс сэргийлнэ.
 */
export function contentDisposition(name: string): string {
  const trimmed = name.trim() === '' ? 'file' : name.trim();
  let ascii = '';
  for (const ch of Buffer.from(trimmed, 'utf8')) {
    ascii += ch < 0x20 || ch >= 0x7f || ch === 0x22 || ch === 0x5c ? '_' : String.fromCharCode(ch);
  }
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}

export class GSpaceHandler {
  constructor(private readonly usecase: GSpaceUsecase) {}

  /** GET /gspace · Bearer · 200 */
  overview: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const ov = await this.usecase.overview(req.ctx, user.id);
    newSuccessResponse(req, res, 200, 'gspace overview', {
      files: ov.files.map((f) => ({ name: f.name, size: f.size, mod_time: f.modTime })),
      used: ov.used,
      limit: ov.limit,
    });
  };

  /** POST /gspace/upload · Bearer + write limit · 200 · 400 · 422 */
  upload: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const body = decodeBody(req, uploadSchema);
    // base64 биш агуулга нь 400 — Buffer.from нь чимээгүй тайрдаг тул ил шалгана.
    const data = Buffer.from(body.data, 'base64');
    if (
      data.length === 0 ||
      data.toString('base64').replace(/=+$/, '') !== body.data.replace(/=+$/, '')
    ) {
      newErrorResponse(req, res, 400, 'invalid base64 data');
      return;
    }
    await this.usecase.upload(req.ctx, user.id, body.name, data);
    newSuccessResponse(req, res, 200, 'file uploaded');
  };

  /** GET /gspace/download?name= · Bearer · 200 (octet-stream) · 400 · 404 */
  download: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const name = queryName(req);
    if (name.trim() === '') {
      newErrorResponse(req, res, 400, 'name required');
      return;
    }
    const data = await this.usecase.download(req.ctx, user.id, name);
    // octet-stream + attachment + nosniff: байт нь ТАТАГДАНА, HTML болж
    // хэзээ ч рендерлэгдэхгүй (хадгалагдсан XSS-ээс хамгаална).
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(data);
  };

  /** DELETE /gspace?name= · Bearer + write limit · 200 · 400 */
  deleteFile: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'invalid token');
      return;
    }
    const name = queryName(req);
    if (name.trim() === '') {
      newErrorResponse(req, res, 400, 'name required');
      return;
    }
    await this.usecase.deleteFile(req.ctx, user.id, name);
    newSuccessResponse(req, res, 200, 'file deleted');
  };
}

export const newGSpaceHandler = (usecase: GSpaceUsecase): GSpaceHandler =>
  new GSpaceHandler(usecase);
