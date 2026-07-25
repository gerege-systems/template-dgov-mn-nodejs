// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// PDF гарын үсгийн (PAdES) HTTP давхарга. Бүх endpoint нэвтэрсэн иргэн шаардана;
// session-ийн эзэмшил нь иргэний eID РЕГИСТРЭЭР тодорхойлогдоно (IDOR хаалт).

import busboy from 'busboy';

import { badRequest, DomainError } from '../../../../apperror/index.js';
import type { AssetsUsecase } from '../../../../usecases/assets/assets_usecase.js';
import type { SignUsecase } from '../../../../usecases/sign/sign_usecase.js';
import type { UsersUsecase } from '../../../../usecases/users/users_usecase.js';
import { currentUserFromRequest } from '../../../middlewares/auth.js';
import { newAbortResponse, newErrorResponse, newSuccessResponse } from '../../../response.js';
import type { AsyncHandler, Request } from '../../../types.js';

/** maxUpload нь 25 MB + overhead — Go хувилбартай ижил тодорхой дээд хязгаар. */
const maxUpload = 26 << 20;

interface UploadedForm {
  filename: string;
  file: Buffer;
  onBehalfOf: string;
}

/**
 * parseUpload нь multipart/form-data-аас `file` болон `onBehalfOf`-ыг уншина.
 * Хэмжээ хэтэрвэл урсгалыг таслаж алдаа өгнө (санах ой шавхагдахаас хамгаална).
 */
function parseUpload(req: Request): Promise<UploadedForm> {
  return new Promise<UploadedForm>((resolve, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxUpload } });
    } catch {
      reject(badRequest('invalid form'));
      return;
    }

    const chunks: Buffer[] = [];
    let filename = '';
    let onBehalfOf = '';
    let tooLarge = false;
    let settled = false;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      req.unpipe(bb);
      reject(err);
    };

    bb.on('file', (_name, stream, info) => {
      filename = info.filename;
      stream.on('data', (d: Buffer) => chunks.push(d));
      stream.on('limit', () => {
        tooLarge = true;
        stream.resume();
      });
    });
    bb.on('field', (name, value) => {
      if (name === 'onBehalfOf') onBehalfOf = value;
    });
    bb.on('error', (err: unknown) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });
    bb.on('close', () => {
      if (settled) return;
      settled = true;
      if (tooLarge) {
        reject(badRequest('PDF хэмжээ хэтэрсэн (25 MB)'));
        return;
      }
      resolve({ filename, file: Buffer.concat(chunks), onBehalfOf });
    });

    req.pipe(bb);
  });
}

/**
 * contentDisposition нь татах файлын нэрийг зөв дамжуулна. HTTP header-ийн утга
 * нь latin-1 тул кирилл нэрийг `filename="…"`-д шууд тавьбал browser буруу
 * тайлдаг: RFC 5987/6266-ийн `filename*=UTF-8''…` + ASCII fallback хосыг өгнө.
 */
export function contentDisposition(name: string): string {
  const trimmed = name.trim() === '' ? 'signed.pdf' : name.trim();
  let ascii = '';
  for (const byte of Buffer.from(trimmed, 'utf8')) {
    ascii +=
      byte < 0x20 || byte >= 0x7f || byte === 0x22 || byte === 0x5c
        ? '_'
        : String.fromCharCode(byte);
  }
  if (ascii.replace(/_/g, '') === '') ascii = 'signed.pdf';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}

const pathParam = (req: Request, key: string): string => {
  const raw: unknown = req.params[key];
  return typeof raw === 'string' ? raw : '';
};

export class SignHandler {
  constructor(
    private readonly sign: SignUsecase,
    private readonly users: UsersUsecase,
    private readonly assets: AssetsUsecase,
  ) {}

  /**
   * currentRegNo нь нэвтэрсэн иргэний РЕГИСТРийг буцаана. eID хэрэглэгчийн
   * username нь "eid_"+civil_id (регистр БИШ) тул `nationalId`-аас авна. Энэ
   * утга нь sign session-ийн эзэмшигчийн түлхүүр — Poll/Download дээр тулгагдана.
   */
  private async currentRegNo(req: Request): Promise<string> {
    const user = currentUserFromRequest(req);
    if (!user) throw badRequest('unauthorized');
    const res = await this.users.getById(req.ctx, { id: user.id });
    const regNo = res.user.nationalId.trim();
    if (regNo === '') throw badRequest('eID регистрийн дугаар олдсонгүй');
    return regNo;
  }

  /**
   * init нь PDF-ийг хүлээж авч eID PIN2 гарын үсгийн session эхлүүлнэ.
   *
   * POST /sign/init (multipart) · Bearer · 200 · 400 · 401 · 403
   */
  init: AsyncHandler = async (req, res) => {
    const user = currentUserFromRequest(req);
    if (!user) {
      newAbortResponse(req, res, 'unauthorized');
      return;
    }
    const ures = await this.users.getById(req.ctx, { id: user.id });
    const regNo = ures.user.nationalId.trim();
    // Public-RP хэрэглэгчид РД байхгүй байж болзошгүй — цэвэр 400.
    if (regNo === '') {
      newErrorResponse(req, res, 400, 'eID регистрийн дугаар олдсонгүй');
      return;
    }

    let form: UploadedForm;
    try {
      form = await parseUpload(req);
    } catch (err) {
      if (err instanceof DomainError) throw err;
      newErrorResponse(req, res, 400, 'invalid form');
      return;
    }
    if (form.file.length === 0) {
      newErrorResponse(req, res, 400, 'file required');
      return;
    }

    const fullName = `${ures.user.lastName} ${ures.user.firstName}`.trim();
    const onBehalfOf = form.onBehalfOf.trim();
    // Визуал гарын үсэг (хувь хүн) + тамга (байгууллагын нэрийн өмнөөс) —
    // best-effort: алдаа гарвал хоосон URL (гарын үсэг зогсохгүй).
    const signatureUrl = await this.assets.getSignature(req.ctx, user.id).catch(() => '');
    let stampUrl = '';
    if (onBehalfOf !== '') {
      const orgReg = onBehalfOf.toUpperCase().replace(/^NTRMN-/, '');
      stampUrl = await this.assets.getStamp(req.ctx, user.id, orgReg).catch(() => '');
    }

    const out = await this.sign.init(req.ctx, {
      regNo,
      fullName,
      filename: form.filename,
      pdf: form.file,
      onBehalfOfOrg: onBehalfOf,
      signatureUrl,
      stampUrl,
    });
    newSuccessResponse(req, res, 200, 'ok', out);
  };

  /**
   * poll нь session-ийн төлвийг буцаана (running|completed|failed|rejected).
   * Зөвхөн эзэмшигч иргэн хандана — бусад бүх тохиолдол ИЖИЛ 404.
   *
   * GET /sign/:id · Bearer · 200 · 401 · 404
   */
  poll: AsyncHandler = async (req, res) => {
    const regNo = await this.currentRegNo(req);
    const state = await this.sign.poll(req.ctx, regNo, pathParam(req, 'id'));
    newSuccessResponse(req, res, 200, 'ok', { state });
  };

  /**
   * download нь PAdES гарын үсэгтэй PDF-ийг урсгана.
   *
   * GET /sign/:id/download · Bearer · 200 · 400 · 401 · 404
   */
  download: AsyncHandler = async (req, res) => {
    const regNo = await this.currentRegNo(req);
    const out = await this.sign.download(req.ctx, regNo, pathParam(req, 'id'));
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(out.filename));
    res.send(out.pdf);
  };
}

export const newSignHandler = (
  sign: SignUsecase,
  users: UsersUsecase,
  assets: AssetsUsecase,
): SignHandler => new SignHandler(sign, users, assets);
