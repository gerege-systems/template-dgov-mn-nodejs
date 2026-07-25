// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { newErrorResponse } from '../response.js';
import type { Middleware } from '../types.js';

// Нийтлэг body-хэмжээний дээд хязгаарууд. Route-ууд хүлээж авдаг payload-доо
// тохирох хамгийн чанга хязгаарыг хэрэглэдэг. Глобал өгөгдмөл нь өөрийн хязгаар
// тогтоогоогүй аль ч route-ийн сүүлчийн хамгаалалтын шугам юм.

/** DefaultBodyMaxBytes нь ердийн JSON API route-уудын дээд хязгаар — 1 MiB. */
export const DefaultBodyMaxBytes = 1 << 20;

/**
 * UploadBodyMaxBytes нь глобал root-ийн туйлын дээд хязгаар (hard ceiling). Файл
 * байршуулдаг цорын ганц route (/api/v1/sign/init multipart PDF ≤25 MB, +
 * /rp/sign relay) энэ хэмжээг шаарддаг тул глобал net-ийг үүгээр тавина; ердийн
 * JSON route-уудыг express.json-ий 1 MiB + auth-ийн route-түвшний 4 KiB cap
 * нарийн хамгаална.
 */
export const UploadBodyMaxBytes = 26 << 20; // 25 MB + overhead (sign PDF)

/**
 * AuthBodyMaxBytes нь register / login / refresh / logout payload-уудыг хамардаг.
 * Эдгээрийн аль нь ч хэдэн зуун байтаас илүү JSON авч явдаггүй; 4 KiB-д
 * хязгаарлах нь нэрээ нууцалсан урсгал хүлээн авдаг цорын ганц route-уудын эсрэг
 * хэт том payload-ийн дайралтыг хууль ёсны ямар ч хүсэлтэд нөлөөлөхгүйгээр хаадаг.
 */
export const AuthBodyMaxBytes = 4 << 10;

/**
 * bodySizeLimitMiddleware нь body нь maxBytes-ээс хэтэрсэн аль ч хүсэлтийг
 * 413 Payload Too Large-ээр татгалздаг. Content-Length мэдэгдсэн бол body
 * уншихаас ӨМНӨ нэгдсэн 413 буцаана; урт нь мэдэгдээгүй/chunked үед урсгалыг
 * тоолж хязгаараас хэтэрмэгц холболтыг таслана.
 */
export function bodySizeLimitMiddleware(maxBytes: number): Middleware {
  return (req, res, next) => {
    const declared = Number(req.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) {
      newErrorResponse(req, res, 413, 'request entity too large');
      return;
    }

    // Chunked / урт нь мэдэгдээгүй body — уншиж байхад нь тоолж хязгаарлана.
    let received = 0;
    const onData = (chunk: Buffer | string): void => {
      received += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (received > maxBytes) {
        req.off('data', onData);
        if (!res.headersSent) newErrorResponse(req, res, 413, 'request entity too large');
        req.destroy();
      }
    };
    req.on('data', onData);
    req.once('end', () => req.off('data', onData));

    next();
  };
}
