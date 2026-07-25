// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { SiteAppearance } from '../../../domain/site.js';
import type { Theme } from '../../../domain/theme.js';

/**
 * SiteAppearanceResponse нь сайтын харагдацын default-ыг frontend-д буцаах
 * хэлбэр. accent нь preset нэр ('cobalt' г.м.) эсвэл '#rrggbb' custom hex.
 */
export interface SiteAppearanceResponse {
  accent: string;
  font: string;
  style: string;
  theme: string;
  updated_at?: Date;
}

export function siteAppearanceResponse(a: SiteAppearance): SiteAppearanceResponse {
  return {
    accent: a.accent,
    font: a.font,
    style: a.style,
    theme: a.theme,
    updated_at: a.updatedAt ?? undefined,
  };
}

/** ThemeResponse нь landing-ийн нэрлэсэн загвар. config нь ҮРГЭЛЖ объект. */
export interface ThemeResponse {
  id: string;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export function themeResponse(t: Theme): ThemeResponse {
  return {
    id: t.id,
    name: t.name,
    // Клиент null шалгах шаардлагагүй байхаар ҮРГЭЛЖ объект буцаана.
    config: t.config,
    is_active: t.isActive,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

export const themeListResponse = (list: Theme[]): ThemeResponse[] => list.map(themeResponse);
