// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Migration CLI — `npm run migrate -- --action=up|down [--dir=migrations]`.
// Энэ нь datasources/migration-ийн нимгэн бүрхүүл (config ачаалах + аргумент
// задлах + pool холбох) тул бодит логик нь integration тестээр шалгагдана.

import path from 'node:path';

import { AppConfig, initializeAppConfig } from '../../config/config.js';
import { LoggerCategory, LoggerCategoryMigration } from '../../constants/index.js';
import { setupPostgres } from '../../datasources/drivers/pg.js';
import { newRunner } from '../../datasources/migration/migration.js';
import * as logger from '../../pkg/logger/logger.js';

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

async function main(): Promise<void> {
  const action = argValue('action', 'up');
  const dir = path.resolve(argValue('dir', 'migrations'));

  if (action !== 'up' && action !== 'down') {
    process.stderr.write(`unknown action "${action}" — expected "up" or "down"\n`);
    process.exit(2);
  }

  initializeAppConfig();
  logger.init();

  const db = await setupPostgres();
  try {
    const runner = newRunner(db.pool, dir);
    if (action === 'up') await runner.up();
    else await runner.down();
  } finally {
    await db.close().catch(() => undefined);
  }

  logger.info(`migration [${action}] finished`, {
    [LoggerCategory]: LoggerCategoryMigration,
    environment: AppConfig.ENVIRONMENT,
  });
}

void main().catch((err: unknown) => {
  process.stderr.write(`migration failed: ${logger.errText(err)}\n`);
  process.exit(1);
});
