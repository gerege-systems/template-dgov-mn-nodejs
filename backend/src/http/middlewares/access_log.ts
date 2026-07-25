// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Middleware } from '../types.js';
import { clientIP } from './clientip.js';

// access-log өнгөний кодууд (xterm SGR background).
const accessLogRed = '41';
const accessLogYellow = '43';
const accessLogGreen = '42';

function formatStamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * accessLogMiddleware нь хүсэлт тус бүрд нэг мөр access log үзүүлнэ. Статус код
 * өнгөтэй болгогдсон тул энгийн `tail -f` session-д 5xx / 4xx тодорч харагдана.
 */
export function accessLogMiddleware(): Middleware {
  return (req, res, next) => {
    const start = new Date();
    const startMs = Date.now();

    res.once('finish', () => {
      const latencyMs = Date.now() - startMs;
      const status = res.statusCode;

      let color: string;
      if (status >= 500) color = accessLogRed;
      else if (status >= 400) color = accessLogYellow;
      else color = accessLogGreen;

      const requestId = req.ctx?.requestId ?? '-';

      process.stdout.write(
        `[LOGGING HTTP] [${formatStamp(start)}] req=${requestId} [${color}m ${status} [0m ${req.method} ${req.originalUrl} ${latencyMs}ms ${req.clientIp ?? clientIP(req)} ${req.get('user-agent') ?? ''}\n`,
      );
    });

    next();
  };
}
