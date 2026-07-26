// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { Redis } from 'ioredis';

import type { Ctx } from '../../pkg/ctx/ctx.js';

/**
 * CacheMissError нь "key байхгүй" гэдгийг Redis-ийн ЖИНХЭНЭ алдаанаас (холболт
 * таслагдсан / timeout) ялгах sentinel юм. Revocation шалгалтыг fail-closed
 * хийхэд шаардлагатай: miss = бичлэг алга (татгалзаагүй, үргэлжлүүл), бусад
 * алдаа = Redis-г шалгаж чадсангүй (болзошгүй татгалзсаныг нэвтрүүлэхгүй).
 */
export class CacheMissError extends Error {
  constructor(key: string) {
    super(`cache miss: ${key}`);
    this.name = 'CacheMissError';
  }
}

/** isCacheMiss нь алдаа нь "key байхгүй" эсэхийг заана. */
export function isCacheMiss(err: unknown): boolean {
  return err instanceof CacheMissError;
}

/**
 * defaultOpTimeout нь Redis-ийн алхам бүрийг хязгаарлаж, удаан/хүрэх боломжгүй
 * Redis нь дуудагчийг хязгааргүй хугацаагаар блоклохоос сэргийлнэ.
 */
const defaultOpTimeoutMs = 3_000;

export interface RedisCache {
  /**
   * set нь value-г JSON болгон хөрвүүлж, кэшийн нийтлэг өгөгдмөл TTL-тэйгээр key
   * дор бичнэ. Дуудалт бүр defaultOpTimeout-оор хязгаарлагдсан.
   */
  set(ctx: Ctx, key: string, value: unknown): Promise<void>;
  /** setTTL нь тодорхой TTL (секунд)-тэйгээр бичнэ. */
  setTTL(ctx: Ctx, key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** get нь key дахь JSON-оор decode хийсэн мөрийг буцаана, эсвэл CacheMissError. */
  get(ctx: Ctx, key: string): Promise<string>;
  /**
   * getDel нь key дахь утгыг уншаад тэр key-г АТОМААР устгана (Redis GETDEL). Нэг
   * удаагийн токеныг (жишээ refresh jti) уншиж-устгахдаа атомаар хийснээр
   * TOCTOU-гийн улмаас зэрэгцээ хоёр хүсэлт нэгэн зэрэг амжилттай болохоос
   * сэргийлнэ.
   */
  getDel(ctx: Ctx, key: string): Promise<string>;
  /** del нь key-г устгана. Байхгүй key нь алдаа биш. */
  del(ctx: Ctx, key: string): Promise<void>;
  /** incr нь бүхэл тоог атомаар нэгээр нэмэгдүүлж шинэ утгыг буцаана. */
  incr(ctx: Ctx, key: string): Promise<number>;
  /** expire нь key дээрх TTL-г (дахин) тогтооно (секунд). */
  expire(ctx: Ctx, key: string, ttlSeconds: number): Promise<void>;
  /**
   * pttl нь key-ийн үлдсэн амьдрах хугацааг миллисекундээр буцаана. Key байхгүй
   * бол -2, TTL-гүй (мөнхийн) бол -1.
   */
  pttl(ctx: Ctx, key: string): Promise<number>;
  close(): Promise<void>;
  /** client нь энэ interface-ээр гаргаагүй командуудад зориулж түүхий клиентийг илчилнэ. */
  client(): Redis;
}

/** withTimeout нь Redis-ийн алхам defaultOpTimeout-оос удаан блоклохгүй байхыг хангана. */
async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('redis operation timed out')),
          defaultOpTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class RedisCacheImpl implements RedisCache {
  private readonly redis: Redis;

  constructor(
    host: string,
    db: number,
    password: string,
    private readonly expiresMinutes: number,
  ) {
    // host нь "host:port" хэлбэртэй (Go хувилбарын Addr-тай ижил).
    const [hostname, port] = splitHostPort(host);
    this.redis = new Redis({
      host: hostname,
      port,
      password: password === '' ? undefined : password,
      db,
      // Хүсэлт хязгааргүй хуримтлагдахаас сэргийлнэ — fail fast.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    // Холболтын алдаа нь process-ийг унагах ёсгүй; auth давхарга fail-closed.
    this.redis.on('error', () => undefined);
  }

  async set(_ctx: Ctx, key: string, value: unknown): Promise<void> {
    await withTimeout(
      this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        this.expiresMinutes * 60,
      ) as Promise<unknown>,
    );
  }

  async setTTL(_ctx: Ctx, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await withTimeout(
      this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        Math.max(1, Math.ceil(ttlSeconds)),
      ) as Promise<unknown>,
    );
  }

  async get(_ctx: Ctx, key: string): Promise<string> {
    const raw = await withTimeout(this.redis.get(key));
    if (raw === null) throw new CacheMissError(key);
    return decodeString(raw);
  }

  async getDel(_ctx: Ctx, key: string): Promise<string> {
    const raw = await withTimeout(this.redis.getdel(key));
    if (raw === null) throw new CacheMissError(key);
    return decodeString(raw);
  }

  async del(_ctx: Ctx, key: string): Promise<void> {
    await withTimeout(this.redis.del(key));
  }

  async incr(_ctx: Ctx, key: string): Promise<number> {
    return withTimeout(this.redis.incr(key));
  }

  async expire(_ctx: Ctx, key: string, ttlSeconds: number): Promise<void> {
    await withTimeout(this.redis.expire(key, Math.max(1, Math.ceil(ttlSeconds))));
  }

  async pttl(_ctx: Ctx, key: string): Promise<number> {
    return withTimeout(this.redis.pttl(key));
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  client(): Redis {
    return this.redis;
  }
}

/**
 * decodeString нь Go хувилбарын хадгалалтын форматтай (JSON-оор кодлогдсон мөр)
 * нийцүүлж уншина. JSON биш түүхий мөрийг ч (гар аргаар тавьсан key) хүлээж авна.
 */
function decodeString(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;
  }
}

function splitHostPort(addr: string): [string, number] {
  const idx = addr.lastIndexOf(':');
  if (idx <= 0) return [addr, 6379];
  const port = Number(addr.slice(idx + 1));
  return [addr.slice(0, idx), Number.isFinite(port) && port > 0 ? port : 6379];
}

export function newRedisCache(
  host: string,
  db: number,
  password: string,
  expiresMinutes: number,
): RedisCache {
  return new RedisCacheImpl(host, db, password, expiresMinutes);
}
