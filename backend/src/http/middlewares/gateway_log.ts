// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { Middleware } from '../types.js';
import { clientIP } from './clientip.js';

/**
 * GatewayRequestRecorder нь нэг бодит хүсэлтийн телеметрийг хүлээн авна.
 * Хэрэгжүүлэлт нь бичилтийг best-effort (алдаа залгидаг) хийдэг тул хариуны
 * хоцролт нэмэгдэхгүй.
 */
export type GatewayRequestRecorder = (
  ctx: Ctx,
  input: { method: string; path: string; status: number; latencyMs: number; clientIp: string },
) => void;

/**
 * isRPGatewayPath нь тухайн зам ГУРАВДАГЧ талын RP-ийн gateway хүсэлт мөн
 * эсэхийг шалгана. ЗӨВХӨН эдгээрийг лог-лоно — платформын ӨӨРИЙН админ/апп-ын
 * дотоод API (rbac/users/themes/gateway/applications г.м.) лог-д ОРОХГҮЙ:
 *
 *   • /rp/sign          — RP-ийн eID цахим гарын үсгийн relay
 *   • /api/v1/provider  — RP-ийн OIDC (Login with DAN) login/consent
 *
 * Эс бөгөөс dashboard-ийн "хүсэлтийн тоо" нь өөрийн UI-ийн трафикаар дүүрч,
 * gateway-ийн телеметр утгагүй болно.
 */
export function isRPGatewayPath(path: string): boolean {
  return path.startsWith('/rp/sign') || path.startsWith('/api/v1/provider');
}

/**
 * gatewayRequestLogMiddleware нь гуравдагч талын RP-ийн gateway хүсэлт бүрийг
 * (method/path/status/latency/ip) API Gateway-ийн хүсэлтийн лог руу бичнэ.
 *
 * Хариу БҮРЭН илгээгдсэний дараа (`res.on('finish')`) бичдэг тул лог бичилт
 * хэрэглэгчийн хүлээх хугацаанд нөлөөлөхгүй.
 */
export function gatewayRequestLogMiddleware(record: GatewayRequestRecorder): Middleware {
  return (req, res, next) => {
    if (!isRPGatewayPath(req.originalUrl.split('?')[0] ?? req.path)) {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const latencyMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
      record(req.ctx, {
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.path,
        status: res.statusCode === 0 ? 200 : res.statusCode,
        latencyMs,
        clientIp: req.clientIp ?? clientIP(req),
      });
    });
    next();
  };
}
