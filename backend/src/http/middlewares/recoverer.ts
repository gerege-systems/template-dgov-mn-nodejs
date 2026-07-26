// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { LoggerCategory, LoggerCategoryHTTP } from '../../constants/index.js';
import * as logger from '../../pkg/logger/logger.js';
import { newErrorResponse } from '../response.js';
import type { NextFunction, Request, Response } from '../types.js';

/**
 * recovererMiddleware нь доош урсгал дахь handler/middleware-ийн баригдаагүй
 * алдааг барьж, stack trace + request_id-г логд бичээд клиентэд нэгдсэн 500
 * BaseResponse дугтуй буцаана. Express-ийн алдааны middleware гэрээг (4 аргумент)
 * дагана тул router-ийн ХАМГИЙН СҮҮЛД суулгана.
 */
export function recovererMiddleware() {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    logger.errorWithContext(req.ctx, 'unhandled error in HTTP handler', {
      [LoggerCategory]: LoggerCategoryHTTP,
      path: req.path,
      panic: logger.errText(err),
      stack: err instanceof Error ? (err.stack ?? '') : '',
    });
    if (res.headersSent) {
      // Хариу аль хэдийн эхэлсэн бол Express-ийн үндсэн зохицуулагч холболтыг
      // таслах ёстой — өөр юу ч бичих боломжгүй.
      next(err);
      return;
    }
    newErrorResponse(req, res, 500, 'internal server error');
  };
}
