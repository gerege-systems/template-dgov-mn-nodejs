// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { timingSafeEqual } from 'node:crypto';

import type { Middleware } from '../types.js';

/**
 * observabilityGate нь /metrics ба /swagger/doc.json гэх мэт операторын
 * endpoint-уудыг хамгаалах нимгэн middleware юм. Эдгээр endpoint нь дотоод үйл
 * ажиллагааны мэдрэмжтэй мэдээллийг (DB pool статистик, хүсэлтийн эзлэхүүн,
 * route нэрс, алдааны түвшин) болон бүх API гадаргуугийн тодорхойлолтыг ил
 * гаргадаг тул нийтэд задгай байх нь reconnaissance-д тусалдаг.
 *
 * Стратеги:
 *   - production биш үед: үргэлж зөвшөөрнө (dev UX-ийг хадгална).
 *   - production-д token хоосон үед: 404 буцаана. Endpoint бүхэлдээ байхгүй мэт
 *     харагдах нь reconnaissance-ыг хүндрүүлнэ.
 *   - production-д token тохируулсан үед: "Authorization: Bearer <token>" яг
 *     тааравал зөвшөөрнө; өөр бол 404 (401 биш — token шаардлагатай гэдгийг,
 *     улмаар endpoint оршин байгааг ил гаргахгүй).
 *
 * Token харьцуулалт нь timingSafeEqual ашиглан timing oracle-ыг хаана. Bearer
 * prefix-ийг case-insensitive нөхдөг.
 */
export function observabilityGate(isProduction: boolean, token: string): Middleware {
  return (req, res, next) => {
    if (!isProduction) {
      next();
      return;
    }
    const notFound = (): void => {
      res.status(404).type('text/plain; charset=utf-8').send('404 page not found\n');
    };
    if (token === '') {
      notFound();
      return;
    }
    const header = req.get('authorization') ?? '';
    const prefix = 'bearer ';
    if (header.length <= prefix.length || header.slice(0, prefix.length).toLowerCase() !== prefix) {
      notFound();
      return;
    }
    const provided = Buffer.from(header.slice(prefix.length).trim());
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      notFound();
      return;
    }
    next();
  };
}
