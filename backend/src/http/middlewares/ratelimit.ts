// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Middleware } from '../types.js';
import { clientIP } from './clientip.js';

/**
 * TokenBucket нь golang.org/x/time/rate.Limiter-ийн шаардлагатай хэсгийг
 * хуулбарлана: секундэд `rate` токен урсаж дүүрдэг, багтаамж нь `burst`.
 */
class TokenBucket {
  private tokensValue: number;
  private lastRefillMs: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    nowMs: number,
  ) {
    this.tokensValue = burst;
    this.lastRefillMs = nowMs;
  }

  private refill(nowMs: number): void {
    const elapsedSeconds = (nowMs - this.lastRefillMs) / 1000;
    if (elapsedSeconds <= 0) return;
    this.tokensValue = Math.min(this.burst, this.tokensValue + elapsedSeconds * this.ratePerSecond);
    this.lastRefillMs = nowMs;
  }

  tokens(nowMs: number): number {
    this.refill(nowMs);
    return this.tokensValue;
  }

  allow(nowMs: number): boolean {
    this.refill(nowMs);
    if (this.tokensValue < 1) return false;
    this.tokensValue -= 1;
    return true;
  }

  limit(): number {
    return this.ratePerSecond;
  }
}

interface IpLimiter {
  limiter: TokenBucket;
  lastSeenMs: number;
}

/**
 * rateLimitedResponse нь BaseResponse-ийн JSON хэлбэрийг тусгана — талбарын
 * нэрсийг ижил байлга.
 */
interface RateLimitedResponse {
  status: boolean;
  message: string;
  request_id?: string;
}

export class RateLimiter {
  private readonly visitors = new Map<string, IpLimiter>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
  ) {
    // 3 минут тутамд хуучирсан бичлэгүүдийг устгана.
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, v] of this.visitors) {
        if (now - v.lastSeenMs > 5 * 60_000) this.visitors.delete(ip);
      }
    }, 3 * 60_000);
    // Цэвэрлэгээний таймер нь process-ийг амьд байлгах ёсгүй.
    this.cleanupTimer.unref();
  }

  private getLimiter(ip: string, nowMs: number): TokenBucket {
    const existing = this.visitors.get(ip);
    if (existing) {
      existing.lastSeenMs = nowMs;
      return existing.limiter;
    }
    const limiter = new TokenBucket(this.ratePerSecond, this.burst, nowMs);
    this.visitors.set(ip, { limiter, lastSeenMs: nowMs });
    return limiter;
  }

  /** stop нь цэвэрлэгээний таймерыг зогсооно. */
  stop(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * middleware нь IP бүрийн token-bucket middleware буцаана. Bucket хоосон үед
   * 429-ээр (хариуг буцааж) богино холбоно.
   */
  middleware(): Middleware {
    return (req, res, next) => {
      const nowMs = Date.now();
      const ip = req.clientIp ?? clientIP(req);
      const limiter = this.getLimiter(ip, nowMs);

      writeRateLimitHeaders(res, this.burst, limiter, nowMs);

      if (!limiter.allow(nowMs)) {
        res.setHeader('Retry-After', String(retryAfterSeconds(limiter, nowMs)));
        const body: RateLimitedResponse = {
          status: false,
          message: 'too many requests, please try again later',
        };
        if (req.ctx?.requestId) body.request_id = req.ctx.requestId;
        res.status(429).type('application/json').send(JSON.stringify(body));
        return;
      }

      next();
    };
  }
}

/**
 * writeRateLimitHeaders нь хязгаар, одоогийн үлдсэн токенууд болон bucket дахин
 * дүүрэх unix timestamp-г зарладаг. Клиентүүд эдгээрийг эхлээд 429 шатаалгүйгээр
 * буцахад ашигладаг.
 */
function writeRateLimitHeaders(
  res: { setHeader(name: string, value: string): void },
  burst: number,
  limiter: TokenBucket,
  nowMs: number,
): void {
  const tokens = limiter.tokens(nowMs);
  const remaining = Math.max(Math.floor(tokens), 0);
  let resetSeconds = 0;
  const r = limiter.limit();
  if (r > 0) {
    // Одоогийн түвшнээс bucket дахин дүүртэл хэдэн секунд үлдсэн.
    const missing = burst - tokens;
    if (missing > 0) resetSeconds = Math.ceil(missing / r);
  }
  res.setHeader('X-RateLimit-Limit', String(burst));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(nowMs / 1000) + resetSeconds));
}

/**
 * retryAfterSeconds нь нэг шинэ токен бэлэн болохоос өмнөх хүлээх хугацааг
 * тооцоолно. RFC 7231 Retry-After нь зөвхөн бүхэл секунд хүлээн авдаг тул
 * дараагийн бүхэл секунд хүртэл дээш дугуйрсан.
 */
function retryAfterSeconds(limiter: TokenBucket, nowMs: number): number {
  const r = limiter.limit();
  if (r <= 0) return 1;
  const deficit = 1 - limiter.tokens(nowMs);
  if (deficit <= 0) return 0;
  return Math.ceil(deficit / r);
}

export function newRateLimiter(ratePerSecond: number, burst: number): RateLimiter {
  return new RateLimiter(ratePerSecond, burst);
}
