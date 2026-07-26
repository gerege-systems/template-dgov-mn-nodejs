// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { ZodType } from 'zod';

import { asDomainError, ErrorType } from '../apperror/index.js';
import { LoggerCategory, LoggerCategoryHTTP } from '../constants/index.js';
import * as logger from '../pkg/logger/logger.js';
import { ValidationErrors, validatePayloads } from '../pkg/validators/validators.js';
import type { AsyncHandler, ExpressHandler, Request, Response } from './types.js';

/**
 * maxBodyBytes нь decodeBody-д уншиж болох JSON body-ийн дээд хэмжээ —
 * route-түвшний bodySizeLimit middleware-ийн дээр гүний хамгаалалт.
 */
export const maxBodyBytes = 1 << 20; // 1 MiB

/** BaseResponse нь бүх API хариуны нэгдсэн дугтуй. */
export interface BaseResponse {
  status: boolean;
  message?: string;
  data?: unknown;
  request_id?: string;
}

/**
 * wrap нь алдаа шиддэг handler-г Express handler болгоно. Handler-ууд доорх
 * туслахуудаар (newSuccessResponse/respondWithError) хариугаа БИЧИЖ дуусдаг тул
 * энд баригдсан алдаа нь эсвэл usecase-ийн алдаа (дугтуй болж хувирна), эсвэл
 * бичих/encode-ийн алдаа (хариу аль хэдийн бичигдсэн тул зөвхөн логдоно).
 */
export function wrap(h: AsyncHandler): ExpressHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        await h(req, res);
      } catch (err) {
        if (res.headersSent) {
          logger.errorWithContext(req.ctx, 'response write failed', {
            [LoggerCategory]: LoggerCategoryHTTP,
            path: req.path,
            error: logger.errText(err),
          });
          return;
        }
        try {
          respondWithError(req, res, err);
        } catch (writeErr) {
          logger.errorWithContext(req.ctx, 'response write failed', {
            [LoggerCategory]: LoggerCategoryHTTP,
            path: req.path,
            error: logger.errText(writeErr),
          });
          next(writeErr);
        }
      }
    })();
  };
}

/** requestId нь request-id middleware-ийн тавьсан корреляцийн ID-г уншина. */
function requestId(req: Request): string | undefined {
  return req.ctx?.requestId;
}

/**
 * decodeBody нь хүсэлтийн JSON body-г схемээр баталгаажуулж буцаана. Танихгүй
 * талбарыг схем нь татгалзана (strictObject); body-ийн хэмжээ нь express.json-ий
 * limit-ээр хязгаарлагдсан.
 */
export function decodeBody<T>(req: Request, schema: ZodType<T>): T {
  const body: unknown = req.body;
  if (
    body === undefined ||
    body === null ||
    (typeof body === 'object' &&
      !Array.isArray(body) &&
      Object.keys(body).length === 0 &&
      req.get('content-length') === undefined)
  ) {
    throw new Error('empty request body');
  }
  return validatePayloads(schema, body);
}

/** decodeQuery нь query string-ийг схемээр баталгаажуулна. */
export function decodeQuery<T>(req: Request, schema: ZodType<T>): T {
  return validatePayloads(schema, req.query);
}

function writeJSON(res: Response, statusCode: number, body: BaseResponse): void {
  res.status(statusCode).type('application/json; charset=utf-8').send(JSON.stringify(body));
}

/** newSuccessResponse нь амжилтын дугтуй бичнэ. */
export function newSuccessResponse(
  req: Request,
  res: Response,
  statusCode: number,
  message: string,
  data?: unknown,
): void {
  const body: BaseResponse = { status: true };
  if (message !== '') body.message = message;
  if (data !== undefined && data !== null) body.data = data;
  const rid = requestId(req);
  if (rid) body.request_id = rid;
  writeJSON(res, statusCode, body);
}

/** newErrorResponse нь алдааны дугтуй бичнэ. */
export function newErrorResponse(
  req: Request,
  res: Response,
  statusCode: number,
  errMsg: string,
): void {
  const body: BaseResponse = { status: false, message: errMsg };
  const rid = requestId(req);
  if (rid) body.request_id = rid;
  writeJSON(res, statusCode, body);
}

/** newAbortResponse нь нэгдсэн дугтуйтай 401-г үзүүлнэ (auth middleware ашигладаг). */
export function newAbortResponse(req: Request, res: Response, message: string): void {
  newErrorResponse(req, res, 401, message);
}

/** mapDomainErrorToHTTP нь домэйн алдааг HTTP статус код руу хувиргана. */
function mapDomainErrorToHTTP(err: unknown): number {
  const domErr = asDomainError(err);
  if (!domErr) return 500;
  switch (domErr.type) {
    case ErrorType.NotFound:
      return 404;
    case ErrorType.Unauthorized:
      return 401;
    case ErrorType.Forbidden:
      return 403;
    case ErrorType.Conflict:
      return 409;
    case ErrorType.BadRequest:
      return 400;
    default:
      return 500;
  }
}

/**
 * respondWithError нь цэвэрлэсэн алдааны хариу гаргаж, дотоод (5xx) бүх алдааны
 * үндсэн шалтгааныг бүртгэдэг. "Дэлгэрэнгүйг бүртгэж, хэрэглэгчид цэвэр мессеж
 * харуулах" дүрмийг төвлөрүүлдэг тул аль ч handler ороомог болсон сангийн алдааг
 * body руу санамсаргүй түлхэхгүй.
 */
export function respondWithError(req: Request, res: Response, err: unknown): void {
  // Баталгаажуулалтын алдаанууд талбар бүрийн дэлгэрэнгүйтэйгээр 422 болж гарна.
  if (err instanceof ValidationErrors) {
    const body: BaseResponse = {
      status: false,
      message: 'validation failed',
      data: { errors: err.errors },
    };
    const rid = requestId(req);
    if (rid) body.request_id = rid;
    writeJSON(res, 422, body);
    return;
  }

  const status = mapDomainErrorToHTTP(err);
  let message = logger.errText(err);

  if (status >= 500) {
    const domErr = asDomainError(err);
    const fields: logger.Fields = {
      [LoggerCategory]: LoggerCategoryHTTP,
      path: req.path,
      cause: domErr?.cause !== undefined ? logger.errText(domErr.cause) : logger.errText(err),
    };
    const rid = requestId(req);
    if (rid) fields.request_id = rid;
    logger.error('internal error while handling request', fields);
    message = 'internal server error';
  }

  newErrorResponse(req, res, status, message);
}
