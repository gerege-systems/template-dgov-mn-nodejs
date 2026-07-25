// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// platform_settings (нэг мөрт тохиргоо) хүснэгтийн Postgres gateway —
// платформын хандалтын горим (public|private). Хэрэглэгч-тус-бүрийн БИШ тул
// RLS-гүй.

import { badRequest, internalCause, notFound } from '../../../../apperror/index.js';
import { AccessModePrivate, AccessModePublic } from '../../../../domain/platform.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type { PlatformSettingsRepository } from '../../interface/sso.js';

class PlatformSettingsPostgres implements PlatformSettingsRepository {
  constructor(private readonly db: Db) {}

  async getAccessMode(ctx: Ctx): Promise<string> {
    let res;
    try {
      res = await this.db.query<{ access_mode: string }>(
        ctx,
        `SELECT access_mode FROM platform_settings WHERE id = 1`,
      );
    } catch (err) {
      throw internalCause(err);
    }
    const row = res.rows[0];
    // Мөр байхгүй нь тохиргооны алдаа — fail-closed (нэвтрэлт зогсоно), учир нь
    // "public гэж үзэх" нь private платформыг чимээгүй нээх эрсдэлтэй.
    if (!row) throw notFound('platform settings not found');
    return row.access_mode;
  }

  async setAccessMode(ctx: Ctx, mode: string): Promise<void> {
    if (mode !== AccessModePublic && mode !== AccessModePrivate) {
      throw badRequest("access_mode нь 'public' эсвэл 'private' байх ёстой");
    }
    let affected: number;
    try {
      const res = await this.db.query(
        ctx,
        `UPDATE platform_settings SET access_mode = $1, updated_at = now() WHERE id = 1`,
        [mode],
      );
      affected = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (affected === 0) throw notFound('platform settings not found');
  }
}

export const newPlatformSettingsRepository = (db: Db): PlatformSettingsRepository =>
  new PlatformSettingsPostgres(db);
