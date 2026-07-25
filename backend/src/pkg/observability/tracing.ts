// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// observability нь OpenTelemetry-ийн tracing-ийг тохируулна. OTEL_EXPORTER
// хоосон бол SDK огт эхлэхгүй (noop provider) — tracing идэвхгүй үед энэ нь
// бараг ямар ч зардалгүй.

import * as logger from '../logger/logger.js';

/** Shutdown нь SDK-г эмх цэгцтэй унтраах функц. */
export type Shutdown = () => Promise<void>;

export interface TracingConfig {
  serviceName: string;
  environment: string;
  /** "" = идэвхгүй, "stdout" = console, "otlp" = OTLP/HTTP collector. */
  exporter: string;
  sampleRatio: number;
}

/**
 * setupTracing нь exporter тохируулагдсан үед л OTel SDK-г эхлүүлнэ. SDK-ийн
 * модулиудыг ДИНАМИКААР import хийдэг — эс бөгөөс tracing идэвхгүй үед ч хүнд
 * instrumentation-ууд ачаалагдаж boot удаашрах байлаа.
 *
 * Service нэр, sampler зэргийг SDK-ийн стандарт орчны хувьсагчаар дамжуулна
 * (OTEL_SERVICE_NAME / OTEL_TRACES_SAMPLER…) — ингэснээр OTel-ийн хувилбар
 * солигдоход API-ийн өөрчлөлтөд өртөх гадаргуу хамгийн бага байна.
 */
export async function setupTracing(cfg: TracingConfig): Promise<Shutdown> {
  const exporter = cfg.exporter.trim().toLowerCase();
  if (exporter === '') {
    return () => Promise.resolve();
  }

  process.env.OTEL_SERVICE_NAME ??= cfg.serviceName;
  process.env.OTEL_RESOURCE_ATTRIBUTES ??= `deployment.environment=${cfg.environment}`;
  process.env.OTEL_TRACES_SAMPLER ??= 'parentbased_traceidratio';
  process.env.OTEL_TRACES_SAMPLER_ARG ??= String(cfg.sampleRatio > 0 ? cfg.sampleRatio : 1);
  if (exporter === 'stdout') process.env.OTEL_TRACES_EXPORTER ??= 'console';

  try {
    const [{ NodeSDK }, { getNodeAutoInstrumentations }] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/auto-instrumentations-node'),
    ]);

    const sdk = new NodeSDK({
      instrumentations: [
        getNodeAutoInstrumentations({
          // fs instrumentation нь маш шуугиантай тул унтраана.
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    return async () => {
      await sdk.shutdown().catch(() => undefined);
    };
  } catch (err) {
    // Tracing нь сонголттой чадвар — түүний тохиргооны алдаа боот унагах ёсгүй.
    logger.warn(`tracing setup skipped: ${logger.errText(err)}`, { category: 'server' });
    return () => Promise.resolve();
  }
}
