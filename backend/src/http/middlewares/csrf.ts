// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { timingSafeEqual } from 'node:crypto';

import { AccessCookie, CsrfCookie, CsrfHeader, readCookies } from '../cookies.js';
import * as logger from '../../pkg/logger/logger.js';
import { newErrorResponse } from '../response.js';
import type { Middleware } from '../types.js';

/** safeMethods нь төлөв ӨӨРЧЛӨХГҮЙ (CSRF-д хамааралгүй) HTTP аргууд. */
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * csrfMiddleware нь double-submit загвараар CSRF-ээс хамгаална.
 *
 * ХАМРАХ ХҮРЭЭ: зөвхөн `dgov_access` COOKIE-той бөгөөд `Authorization` толгой
 * БАЙХГҮЙ мутацийн хүсэлт. Учир нь:
 *   • cookie нь ambient credential — browser түүнийг cross-site хүсэлтэд ч
 *     автоматаар хавсаргадаг тул CSRF боломжтой;
 *   • Bearer токен нь ambient БИШ — халдагчийн сайт түүнийг гаргаж чадахгүй
 *     (JS-д хадгалагдаагүй), иймд мобайл/m2m урсгалд энэ шалгалт хэрэггүй;
 *   • cookie-гүй нээлттэй endpoint-ууд (нэвтрэлт, peer webhook) өөрсдийн
 *     хамгаалалттай (rate limit, HMAC гарын үсэг).
 *
 * Хамгаалалт: ЖС-ээс уншигдах `dgov_csrf` cookie-г `x-dgov-csrf` толгойтой
 * тулгана. Гуравдагч талын сайт cookie-г УНШИЖ чадахгүй (same-origin бодлого)
 * тул толгойг зөв бөглөж чадахгүй.
 */
export function csrfMiddleware(): Middleware {
  return (req, res, next) => {
    if (safeMethods.has(req.method)) {
      next();
      return;
    }
    // Bearer толгойтой бол ambient credential биш — алгасна.
    if ((req.get('authorization') ?? '') !== '') {
      next();
      return;
    }

    const cookies = readCookies(req);
    // Session cookie байхгүй бол хамгаалах ambient эрх ч байхгүй.
    if (!cookies[AccessCookie]) {
      next();
      return;
    }

    const expected = cookies[CsrfCookie] ?? '';
    const provided = req.get(CsrfHeader) ?? '';
    if (expected === '' || provided === '' || !constantTimeEqual(expected, provided)) {
      logger.warnWithContext(req.ctx, 'CSRF: double-submit шалгалт амжилтгүй', {
        middleware: 'CsrfMiddleware',
        file: 'middlewares/csrf.ts',
        path: req.path,
        method: req.method,
        has_cookie: expected !== '',
        has_header: provided !== '',
      });
      newErrorResponse(req, res, 403, 'csrf token missing or invalid');
      return;
    }
    next();
  };
}

/** constantTimeEqual нь урт задруулахгүйгээр тогтмол хугацаанд тулгана. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
