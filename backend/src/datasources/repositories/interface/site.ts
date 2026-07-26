// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { SiteAppearance } from '../../../domain/site.js';
import type { Theme } from '../../../domain/theme.js';
import type { Ctx } from '../../../pkg/ctx/ctx.js';

/**
 * SiteRepository нь site_appearance (сайтын нийтийн харагдацын default) ГАНЦ
 * мөрийн gateway. Хэрэглэгч-тус-бүрийн БИШ нийтийн config тул RLS-д хамаарахгүй.
 */
export interface SiteRepository {
  getAppearance(ctx: Ctx): Promise<SiteAppearance>;
  /** setAppearance — seed мөр байхгүй бол apperror.notFound (migration ажиллаагүй). */
  setAppearance(ctx: Ctx, a: SiteAppearance): Promise<void>;
}

/**
 * ThemeRepository нь themes хүснэгтийн (landing-ийн нэрлэсэн загварууд) gateway.
 * Нийтийн config тул RLS-д хамаарахгүй.
 */
export interface ThemeRepository {
  listThemes(ctx: Ctx): Promise<Theme[]>;
  getTheme(ctx: Ctx, id: string): Promise<Theme>;
  /** getActiveTheme — идэвхтэй theme байхгүй бол apperror.notFound. */
  getActiveTheme(ctx: Ctx): Promise<Theme>;
  createTheme(ctx: Ctx, name: string, config: Record<string, unknown>): Promise<Theme>;
  updateTheme(ctx: Ctx, id: string, name: string, config: Record<string, unknown>): Promise<void>;
  deleteTheme(ctx: Ctx, id: string): Promise<void>;
  /**
   * setActive нь нэг theme-ийг идэвхтэй болгож БУСДЫГ идэвхгүй болгоно. Partial
   * unique index-ийн улмаас алхмыг НЭГ транзакцид хийж, эхлээд бусдыг унтраана.
   */
  setActive(ctx: Ctx, id: string): Promise<void>;
}
