// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// observability/metrics нь процессийн Prometheus registry болон хэмжигдэхүүнүүдийн
// цорын ганц эх сурвалж юм.
//
// Яагаад pkg/-д байна вэ: usecase давхарга (кэшийн hit/miss, OTP илгээлт г.м.)
// хэмжигдэхүүн тэмдэглэх шаардлагатай. Хэрэв registry нь http/ дор байвал
// usecase → http гэсэн хамаарал үүсч, Clean Architecture-ийн "хамаарал зөвхөн
// дотогш" дүрэм зөрчигдөнө. pkg нь хамгийн доод түвшний хуваалцсан давхарга тул
// бүх давхарга түүнээс хамаарч болно.

import client from 'prom-client';

/** registry нь энэ процессийн бүх Prometheus хэмжигдэхүүнийг цуглуулна. */
export const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Нийт HTTP хүсэлтийн тоо (method / route / status кодоор).',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP хүсэлтийн боловсруулалтын хугацаа (секунд).',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Одоо боловсруулагдаж буй HTTP хүсэлтийн тоо.',
  registers: [registry],
});

const cacheOpsTotal = new client.Counter({
  name: 'cache_ops_total',
  help: 'Кэшийн үйлдлүүд давхарга / үйлдэл / үр дүнгээр.',
  labelNames: ['layer', 'op', 'result'] as const,
  registers: [registry],
});

/**
 * observeCacheOp нь кэшийн нэг үйлдлийг тэмдэглэнэ. hit/miss харьцаа нь кэш
 * үнэхээр ач холбогдолтой эсэхийг харуулдаг цорын ганц найдвартай мэдээлэл.
 *
 *   layer:  "memory" | "redis"
 *   op:     "get" | "set" | "del"
 *   result: "hit" | "miss" | "ok" | "error"
 */
export function observeCacheOp(layer: string, op: string, result: string): void {
  cacheOpsTotal.inc({ layer, op, result });
}

/** registerDbPoolMetrics нь pg pool-ийн статистикийг /metrics-т илчилнэ. */
export function registerDbPoolMetrics(
  stats: () => { total: number; idle: number; waiting: number },
): void {
  new client.Gauge({
    name: 'db_pool_connections',
    help: 'Postgres pool-ийн холболтын тоо төлөвөөр.',
    labelNames: ['state'] as const,
    registers: [registry],
    collect(): void {
      const s = stats();
      this.set({ state: 'total' }, s.total);
      this.set({ state: 'idle' }, s.idle);
      this.set({ state: 'waiting' }, s.waiting);
    },
  });
}
