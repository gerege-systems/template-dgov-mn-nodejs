// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Хэмжигдэхүүнүүд өөрсдөө pkg/observability-д тодорхойлогдсон — usecase давхарга
// ч тэднийг тэмдэглэдэг тул registry нь HTTP давхаргаас доогуур байх ёстой
// (хамаарал зөвхөн дотогш).

import {
  httpRequestDuration,
  httpRequestsInFlight,
  httpRequestsTotal,
} from '../../pkg/observability/metrics.js';
import type { Middleware } from '../types.js';

export { registerDbPoolMetrics, registry } from '../../pkg/observability/metrics.js';

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
