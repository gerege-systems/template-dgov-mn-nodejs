// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// API серверийн entry point. Тохиргоог ачаалж, logger-ийг эхлүүлж, апп-ыг
// угсарч, SIGINT/SIGTERM дээр эмх цэгцтэй унтраана.

import { AppConfig, initializeAppConfig } from '../../config/config.js';
import {
  LoggerCategory,
  LoggerCategoryConfig,
  LoggerCategoryServer,
} from '../../constants/index.js';
import * as logger from '../../pkg/logger/logger.js';
import { newApp } from './server/server.js';

async function main(): Promise<void> {
  try {
    initializeAppConfig();
  } catch (err) {
    // Logger нь тохиргооноос хамаардаг тул энд шууд stderr рүү бичнэ.
    process.stderr.write(`failed to load configuration: ${logger.errText(err)}\n`);
    process.exit(1);
  }

  logger.init();
  logger.info('configuration loaded', {
    [LoggerCategory]: LoggerCategoryConfig,
    environment: AppConfig.ENVIRONMENT,
  });

  const app = await newApp();
  // SLA хяналтын background sweep-үүд — shutdown үед цуцлагдана.
  app.startBackgroundWorkers();
  await app.listen();

  let shuttingDown = false;
  const stop = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}`, { [LoggerCategory]: LoggerCategoryServer });
    void app.shutdown().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  // Баригдаагүй promise-ийн алдаа нь процессийг чимээгүй унтраах ёсгүй —
  // логдоод үргэлжилнэ (HTTP давхаргын алдаа аль хэдийн баригдсан байдаг).
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', {
      [LoggerCategory]: LoggerCategoryServer,
      error: logger.errText(reason),
    });
  });
}

void main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${logger.errText(err)}\n`);
  process.exit(1);
});
