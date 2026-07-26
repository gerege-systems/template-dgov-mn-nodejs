// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { randomUUID } from 'node:crypto';

import { trace } from '@opentelemetry/api';

import type { Middleware } from '../types.js';

export const RequestIDHeader = 'X-Request-ID';

/** maxRequestIDLen нь клиентийн өгсөн X-Request-ID-ийн зөвшөөрөгдөх дээд урт. */
const maxRequestIDLen = 128;

/**
 * validRequestID нь клиентийн өгсөн корреляцийн ID-г баталгаажуулна —
 * log-flooding / log-injection (terminal escape, parser хуурах)-аас сэргийлж урт
 * болон тэмдэгтийн багцыг хязгаарлана.
 */
export function validRequestID(s: string): boolean {
  if (s === '' || s.length > maxRequestIDLen) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

/**
 * requestIDMiddleware нь ирж буй X-Request-ID-г хүлээж авна (эсвэл байхгүй бол
 * UUID үүсгэдэг), хариунд буцаан тусгаж, хүсэлтийн ctx руу хоёр корреляцийн ID-г
 * гүүрлэдэг тул logger.*WithContext нь тэдгээрийг log мөр бүрд гаргадаг:
 *
 *   - request_id: гадаад клиентэд харагдах ID.
 *   - traceId:    OTel-ийн үүсгэсэн W3C trace ID.
 *
 * Үүнийг tracing middleware-ийн ДАРАА суулга — ингэснээр trace ID-г гаргаж авах
 * үед OTel span context аль хэдийн тогтоогдсон байна.
 */
export function requestIDMiddleware(): Middleware {
  return (req, res, next) => {
    const incoming = req.get(RequestIDHeader) ?? '';
    const requestId = validRequestID(incoming) ? incoming : randomUUID();

    res.setHeader(RequestIDHeader, requestId);

    req.ctx = { ...(req.ctx ?? {}), requestId };

    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    if (traceId) {
      res.setHeader('X-Trace-ID', traceId);
    }

    next();
  };
}
