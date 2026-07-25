// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Процессийн дотоод (in-process) кэш — Go хувилбарын Ristretto давхаргын
// эквивалент. Хэмжээгээ хязгаарласан LRU + TTL; гадаад хамаарал шаардахгүй
// (Node дээр Map нь оруулсан дарааллыг хадгалдаг тул LRU-г түүн дээр барина).
//
// Redis-ээс ЯЛГААТАЙ: энэ нь ЗӨВХӨН нэг процессийн санах ойд оршино. Хэд хэдэн
// api контейнер ажиллаж байвал тэдгээрийн кэш нь тус тусдаа — иймээс энд зөвхөн
// "хуучирсан утга нь аюулгүй" өгөгдлийг (хэрэглэгчийн профайлын уншилт) тавина,
// хэзээ ч токен хүчингүй болгох шийдвэрийг тавихгүй (тэр нь Redis-д, fail-closed).

/** defaultTTLMs нь кэшэлсэн бичлэгүүдийн аюулгүйн сүлжээ болсон хугацаа. */
const defaultTTLMs = 5 * 60 * 1000;

/** defaultMaxEntries нь санах ойн хязгаар — хэтэрвэл хамгийн эртнийг хаяна. */
const defaultMaxEntries = 10_000;

interface Entry {
  value: unknown;
  expiresAtMs: number;
}

export interface MemoryCache {
  /**
   * set нь value-г key дор өгөгдмөл TTL-тэйгээр хадгална. Ristretto-гоос
   * ЯЛГААТАЙ нь бичилт нь синхрон — утга дараагийн get-д шууд харагдана.
   */
  set(key: string, value: unknown): void;
  /** get нь кэшэлсэн утгыг буцаана, эсвэл байхгүй/хугацаа дууссан үед undefined. */
  get(key: string): unknown;
  /** del нь нэг буюу олон key-г устгана. Байхгүй key нь алдаа биш. */
  del(...keys: string[]): void;
  /** clear нь бүх бичлэгийг хаяна (тестүүдэд). */
  clear(): void;
  /** size нь одоогийн бичлэгийн тоо (тестүүдэд/диагностикт). */
  size(): number;
}

class MemoryCacheImpl implements MemoryCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  set(key: string, value: unknown): void {
    // Дахин оруулснаар LRU-гийн дарааллыг сэргээнэ (Map нь оруулсан дарааллаар).
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAtMs: Date.now() + this.ttlMs });
    if (this.entries.size > this.maxEntries) {
      // Хамгийн эртний (least-recently-set) бичлэгийг хаяна.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }

  get(key: string): unknown {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAtMs <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // LRU: уншсан бичлэгийг дараалалд шинэчилнэ.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  del(...keys: string[]): void {
    for (const key of keys) this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

export function newMemoryCache(
  ttlMs: number = defaultTTLMs,
  maxEntries: number = defaultMaxEntries,
): MemoryCache {
  return new MemoryCacheImpl(ttlMs, maxEntries);
}

/**
 * SingleFlight нь ижил түлхүүрийн зэрэгцээ дуудалтуудыг НЭГ гүйцэтгэлд нэгтгэнэ —
 * Go-ийн golang.org/x/sync/singleflight-ийн эквивалент. Кэш алдалт (miss) үед
 * хэдэн зэрэг хүсэлт ирсэн ч DB руу зөвхөн НЭГ query явна (thundering herd).
 *
 * Node нь нэг урсгалтай (single-threaded) тул түлхүүр бүрийн амьд promise-ыг
 * хадгалахад л хангалттай — түгжээ шаардахгүй.
 */
export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  /** do нь key-ийн амьд гүйцэтгэлийг хуваалцана, эс бөгөөс fn-г эхлүүлнэ. */
  async do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    // fn()-г try дотор дуудахгүй: синхрон throw ч promise болж баригдана.
    const p = (async () => fn())().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, p);
    return p;
  }
}
