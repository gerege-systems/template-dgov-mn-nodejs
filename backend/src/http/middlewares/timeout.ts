// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { newErrorResponse } from '../response.js';
import type { Middleware } from '../types.js';

/**
 * DefaultRequestTimeoutMs нь нэг хүсэлтийн боловсруулалтын дээд хугацаа. Удаан
 * гацсан handler / query нь холболтыг хэт удаан эзлэхээс сэргийлэх хамгаалалт
 * (secure_system_guide §5.3, OWASP API4 Unrestricted Resource Consumption).
 * Гадны үйлчилгээ рүү хийх дуудлагууд өөрийн client timeout-той тул энэ
 * хязгаараас тусдаа хязгаарлагдана.
 */
export const DefaultRequestTimeoutMs = 30_000;

/**
 * timeoutMiddleware нь хүсэлтийн ctx дээр цуцлалтын signal тогтооно. Уг signal нь
 * handler-аас usecase → repository руу дамжиж, гадаад fetch болон удаан query-г
 * цуцлана. Энэ нь tracing / request-id middleware-ийн дараа байрлах ёстой —
 * ингэснээр цуцлалттай ctx нь тэдгээрийн тавьсан утгуудыг хадгална.
 */
export function timeoutMiddleware(ms: number = DefaultRequestTimeoutMs): Middleware {
  return (req, res, next) => {
    const controller = new AbortController();
    req.ctx = { ...(req.ctx ?? {}), signal: controller.signal };

    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        newErrorResponse(req, res, 503, 'request timed out');
      }
    }, ms);

    const clear = (): void => {
      clearTimeout(timer);
    };
    res.once('finish', clear);
    res.once('close', () => {
      clear();
      // Клиент холболтоо тасалсан бол доош урсгалын ажлыг цуцална.
      if (!res.writableEnded) controller.abort();
    });

    next();
  };
}
