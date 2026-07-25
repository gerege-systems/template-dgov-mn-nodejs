// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { allowedOriginsList } from '../../config/config.js';
import type { Middleware } from '../types.js';

// CORS тохиргооны тогтмол утгууд.
const corsAllowMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const corsAllowHeaders = [
  'Origin',
  'Content-Type',
  'Content-Length',
  'Accept-Encoding',
  'X-CSRF-Token',
  'Authorization',
  'Accept',
  'Cache-Control',
  'X-Requested-With',
  'X-Request-ID',
];
const corsExposeHeaders = ['Content-Length', 'X-Request-ID'];
const corsMaxAge = 12 * 60 * 60; // 12 цаг, секундээр

/**
 * corsMiddleware нь тохируулсан зөвшөөрөгдсөн origin-уудын жагсаалтаас CORS
 * header-уудыг тогтооно. Цорын ганц origin нь wildcard "*" байх үед credentials
 * идэвхгүй болдог (спецификаци нь credentials + wildcard-г хориглодог); тодорхой
 * allow-list-д credentials идэвхжинэ.
 */
export function corsMiddleware(): Middleware {
  const origins = allowedOriginsList();

  const allowAll = origins.length === 1 && origins[0] === '*';
  const allowCredentials = !allowAll;
  const allowed = new Set(origins);

  const allowMethods = corsAllowMethods.join(', ');
  const allowHeaders = corsAllowHeaders.join(', ');
  const exposeHeaders = corsExposeHeaders.join(', ');
  const maxAge = String(corsMaxAge);

  return (req, res, next) => {
    const origin = req.get('origin');

    // origin-г тусгах ёстой эсэхийг шийднэ. wildcard горимд бид "*" буцаана;
    // allow-list горимд зөвхөн жагсаалтад буй origin-г эгшиглүүлнэ.
    let allowOrigin = '';
    if (allowAll) {
      allowOrigin = '*';
    } else if (origin && allowed.has(origin)) {
      allowOrigin = origin;
    }

    if (allowOrigin !== '') {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      if (!allowAll) res.append('Vary', 'Origin');
      if (allowCredentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', exposeHeaders);
    }

    // Preflight (OPTIONS) хүсэлтэд богино хариулна.
    if (req.method === 'OPTIONS') {
      if (allowOrigin !== '') {
        res.setHeader('Access-Control-Allow-Methods', allowMethods);
        res.setHeader('Access-Control-Allow-Headers', allowHeaders);
        res.setHeader('Access-Control-Max-Age', maxAge);
      }
      res.status(204).end();
      return;
    }

    next();
  };
}
