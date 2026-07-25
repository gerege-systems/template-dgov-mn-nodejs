// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// site_appearance (ганц мөр) болон themes хүснэгтүүдийн Postgres gateway.
//
// Хоёулаа хэрэглэгч-тус-бүрийн БИШ нийтийн config тул Row-Level Security-д
// хамаарахгүй — жирийн pool query-ээр уншина/бичнэ.

import { DomainError, internalCause, notFound } from '../../../../apperror/index.js';
import type { SiteAppearance } from '../../../../domain/site.js';
import type { Theme } from '../../../../domain/theme.js';
import type { Ctx } from '../../../../pkg/ctx/ctx.js';
import type { Db } from '../../../drivers/pg.js';
import type { SiteRepository, ThemeRepository } from '../../interface/site.js';

interface AppearanceRow {
  accent: string;
  font: string;
  style: string;
  theme: string;
  updated_at: Date | null;
}

const themeCols = 'id, name, config, is_active, created_at, updated_at';

interface ThemeRow {
  id: string;
  name: string;
  config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date | null;
}

const toTheme = (r: ThemeRow): Theme => ({
  id: r.id,
  name: r.name,
  // config нь NULL байж болно — домэйнд ҮРГЭЛЖ объект байлгана.
  config: r.config ?? {},
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

class PostgresSiteRepository implements SiteRepository {
  constructor(private readonly db: Db) {}

  async getAppearance(ctx: Ctx): Promise<SiteAppearance> {
    let row: AppearanceRow | undefined;
    try {
      const res = await this.db.query<AppearanceRow>(
        ctx,
        'SELECT accent, font, style, theme, updated_at FROM site_appearance WHERE id = 1',
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    // Seed мөр байхгүй — migration ажиллаагүй эсэхийг илтгэнэ.
    if (!row) throw notFound('site appearance row not found');
    return {
      accent: row.accent,
      font: row.font,
      style: row.style,
      theme: row.theme,
      updatedAt: row.updated_at,
    };
  }

  async setAppearance(ctx: Ctx, a: SiteAppearance): Promise<void> {
    let rowCount = 0;
    try {
      const res = await this.db.query(
        ctx,
        `UPDATE site_appearance SET accent = $1, font = $2, style = $3, theme = $4, updated_at = now() WHERE id = 1`,
        [a.accent, a.font, a.style, a.theme],
      );
      rowCount = res.rowCount ?? 0;
    } catch (err) {
      throw internalCause(err);
    }
    if (rowCount === 0) throw notFound('site appearance row not found');
  }
}

class PostgresThemeRepository implements ThemeRepository {
  constructor(private readonly db: Db) {}

  async listThemes(ctx: Ctx): Promise<Theme[]> {
    try {
      const res = await this.db.query<ThemeRow>(
        ctx,
        `SELECT ${themeCols} FROM themes ORDER BY is_active DESC, created_at`,
      );
      return res.rows.map(toTheme);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async getTheme(ctx: Ctx, id: string): Promise<Theme> {
    let row: ThemeRow | undefined;
    try {
      const res = await this.db.query<ThemeRow>(
        ctx,
        `SELECT ${themeCols} FROM themes WHERE id = $1`,
        [id],
      );
      row = res.rows[0];
    } catch (err) {
      // id нь uuid багана — буруу хэлбэрийн ID нь 22P02 (invalid_text_representation)
      // болно. Тэр нь "байхгүй" гэсэн үг тул 500 биш 404 болгоно.
      if ((err as { code?: string } | null)?.code === '22P02') throw notFound('theme not found');
      throw internalCause(err);
    }
    if (!row) throw notFound('theme not found');
    return toTheme(row);
  }

  async getActiveTheme(ctx: Ctx): Promise<Theme> {
    let row: ThemeRow | undefined;
    try {
      const res = await this.db.query<ThemeRow>(
        ctx,
        `SELECT ${themeCols} FROM themes WHERE is_active LIMIT 1`,
      );
      row = res.rows[0];
    } catch (err) {
      throw internalCause(err);
    }
    if (!row) throw notFound('no active theme');
    return toTheme(row);
  }

  async createTheme(ctx: Ctx, name: string, config: Record<string, unknown>): Promise<Theme> {
    try {
      const res = await this.db.query<ThemeRow>(
        ctx,
        `INSERT INTO themes (name, config) VALUES ($1, $2) RETURNING ${themeCols}`,
        [name, config],
      );
      const row = res.rows[0];
      if (!row) throw internalCause(new Error('insert succeeded but RETURNING produced no row'));
      return toTheme(row);
    } catch (err) {
      throw internalCause(err);
    }
  }

  async updateTheme(
    ctx: Ctx,
    id: string,
    name: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    let rowCount = 0;
    try {
      const res = await this.db.query(
        ctx,
        `UPDATE themes SET name = $2, config = $3, updated_at = now() WHERE id = $1`,
        [id, name, config],
      );
      rowCount = res.rowCount ?? 0;
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '22P02') throw notFound('theme not found');
      throw internalCause(err);
    }
    if (rowCount === 0) throw notFound('theme not found');
  }

  async deleteTheme(ctx: Ctx, id: string): Promise<void> {
    let rowCount = 0;
    try {
      const res = await this.db.query(ctx, 'DELETE FROM themes WHERE id = $1', [id]);
      rowCount = res.rowCount ?? 0;
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '22P02') throw notFound('theme not found');
      throw internalCause(err);
    }
    if (rowCount === 0) throw notFound('theme not found');
  }

  /**
   * setActive нь нэг theme-ийг идэвхтэй болгоно. Partial unique index (зөвхөн нэг
   * is_active=true) байдаг тул алхмыг НЭГ транзакцид, эхлээд бусдыг унтрааж
   * хийнэ — эс бөгөөс index зөрчигдөнө.
   */
  async setActive(ctx: Ctx, id: string): Promise<void> {
    try {
      await this.db.withTx(ctx, async (tx) => {
        await tx.query('UPDATE themes SET is_active = false WHERE is_active');
        const res = await tx.query(
          'UPDATE themes SET is_active = true, updated_at = now() WHERE id = $1',
          [id],
        );
        if ((res.rowCount ?? 0) === 0) throw notFound('theme not found');
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '22P02') throw notFound('theme not found');
      throw err instanceof DomainError ? err : internalCause(err);
    }
  }
}

export function newSiteRepository(db: Db): SiteRepository {
  return new PostgresSiteRepository(db);
}

export function newThemeRepository(db: Db): ThemeRepository {
  return new PostgresThemeRepository(db);
}
