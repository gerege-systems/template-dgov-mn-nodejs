// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Redis } from 'ioredis';

import {
  LoggerCategory,
  LoggerCategoryCache,
  LoggerCategoryDatabase,
} from '../../../constants/index.js';
import type { Db } from '../../../datasources/drivers/pg.js';
import * as logger from '../../../pkg/logger/logger.js';
import type { ExpressHandler, Response } from '../../types.js';

function writeRawJSON(res: Response, statusCode: number, body: unknown): void {
  res.status(statusCode).type('application/json; charset=utf-8').send(JSON.stringify(body));
}

/**
 * HealthHandler нь load balancer / orchestrator-т зориулсан liveness ба
 * readiness endpoint-уудыг үйлчилнэ. Эдгээр нь нэгдсэн BaseResponse дугтуй БИШ,
 * түүхий JSON буцаадаг (Go хувилбартай ижил) — probe-ууд энгийн бүтэц хүлээдэг.
 */
export class HealthHandler {
  constructor(
    private readonly db: Db,
    private readonly redisClient: Redis | null,
  ) {}

  /** health нь процесс амьд эсэхийг л мэдээлнэ (dependency шалгахгүй). */
  health: ExpressHandler = (_req, res) => {
    writeRawJSON(res, 200, { status: true, message: 'service is healthy' });
  };

  /**
   * ready нь өгөгдлийн сан болон Redis-д хүрэх эсэхийг шалгана. Бодит алдааг
   * зөвхөн логд бичнэ; хариунд driver/host detail гаргахгүй (мэдээлэл
   * задлахаас сэргийлж).
   */
  ready: ExpressHandler = (req, res) => {
    void (async () => {
      const checks: Record<string, string> = {};
      let healthy = true;

      try {
        await this.db.pool.query('SELECT 1');
        checks.database = 'ok';
      } catch (err) {
        logger.errorWithContext(req.ctx, 'readiness: database unreachable', {
          [LoggerCategory]: LoggerCategoryDatabase,
          error: logger.errText(err),
        });
        checks.database = 'unreachable';
        healthy = false;
      }

      if (this.redisClient) {
        try {
          await this.redisClient.ping();
          checks.redis = 'ok';
        } catch (err) {
          logger.errorWithContext(req.ctx, 'readiness: redis unreachable', {
            [LoggerCategory]: LoggerCategoryCache,
            error: logger.errText(err),
          });
          checks.redis = 'unreachable';
          healthy = false;
        }
      }

      writeRawJSON(res, healthy ? 200 : 503, { status: healthy, checks });
    })();
  };
}

export function newHealthHandler(db: Db, redisClient: Redis | null): HealthHandler {
  return new HealthHandler(db, redisClient);
}
