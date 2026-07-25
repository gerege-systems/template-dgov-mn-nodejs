// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import client from 'prom-client';

import type { Middleware } from '../types.js';

/** registry нь энэ процессийн бүх Prometheus хэмжигдэхүүнийг цуглуулна. */
export const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Нийт HTTP хүсэлтийн тоо (method / route / status кодоор).',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP хүсэлтийн боловсруулалтын хугацаа (секунд).',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Одоо боловсруулагдаж буй HTTP хүсэлтийн тоо.',
  registers: [registry],
});

/** dbPoolGauges нь pg pool-ийн статистикийг /metrics-т илчилнэ. */
export function registerDbPoolMetrics(
  stats: () => {
    total: number;
    idle: number;
    waiting: number;
  },
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

/**
 * metricsMiddleware нь хүсэлт бүрийг тоолж, үргэлжлэх хугацааг хэмжинэ. Route
 * label-д Express-ийн ЗАГВАР замыг (/api/v1/users/:id) ашиглана — түүхий замыг
 * ашиглавал ID бүр өөрийн time series үүсгэж, cardinality тэсрэх байсан.
 */
export function metricsMiddleware(): Middleware {
  return (req, res, next) => {
    const endTimer = httpRequestDuration.startTimer();
    httpRequestsInFlight.inc();

    res.once('finish', () => {
      httpRequestsInFlight.dec();
      const route =
        (req.route as { path?: string } | undefined)?.path ?? (req.baseUrl || 'unmatched');
      const labels = {
        method: req.method,
        route: typeof route === 'string' ? route : 'unmatched',
        status: String(res.statusCode),
      };
      httpRequestsTotal.inc(labels);
      endTimer(labels);
    });

    next();
  };
}
