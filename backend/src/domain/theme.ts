// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { SiteFonts, SiteStyles, SiteThemes, siteHexRe } from './site.js';

/**
 * Theme нь landing (нүүр) хуудасны нэрлэсэн БҮРЭН загвар — харагдац (палетр ·
 * фонт · стиль · загвар) + landing-ийн бүх текст/цэс. config нь JSONB (frontend
 * template default дээр deep-merge хийдэг тул уян хатан). Идэвхтэй (isActive)
 * theme-ийг нэвтрээгүй зочин харна.
 */
export interface Theme {
  id: string;
  name: string;
  /** config нь чөлөөт JSONB — landing-ийн текст/цэс агуулна. */
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * Theme-д зөвшөөрөгдсөн өнгөний base токенуудын түлхүүр (globals.css :root-тэй
 * нийцнэ).
 *
 * lpNavy — landing hero/body-ийн navy дэвсгэр (--lp-navy); lpHeader — landing
 * дээд цэс (header/nav)-ийн дэвсгэр (--lp-header). Бусад токен app-ын --bg
 * г.м.-д ноогддог бол эдгээр landing-д тусгайлан ноогдоно.
 */
export const ThemeColorKeys = new Set([
  'bg',
  'surface',
  'surface2',
  'fg',
  'muted',
  'border',
  'borderStrong',
  'danBlue',
  'gold',
  'success',
  'danger',
  'lpNavy',
  'lpHeader',
]);

/** config JSONB-ийн дээд хэмжээ (нийт текст/цэс хоёр хэлээр) — DoS-оос хамгаална. */
export const ThemeConfigMaxBytes = 128 * 1024;

/**
 * validateThemeConfig нь config JSONB-ийг баталгаажуулна: appearance-ийн enum/
 * hex, өнгөний түлхүүр, нийт хэмжээ. Landing-ийн текст ЧӨЛӨӨТ (зөвхөн хэмжээгээр
 * хязгаарлана) — тэр нь хоёр хэл дээрх бүх агуулгыг барих ёстой тул схемээр
 * хатууруулах нь ач холбогдолгүй хязгаарлалт болно.
 *
 * Алдаа гарвал ХҮНД УНШИГДАХ мессежтэй Error шидэнэ (usecase давхарга түүнийг
 * 400 болгоно).
 */
export function validateThemeConfig(config: Record<string, unknown>): void {
  const size = Buffer.byteLength(JSON.stringify(config), 'utf8');
  if (size > ThemeConfigMaxBytes) {
    throw new Error(
      `theme config too large (${String(size)} bytes, max ${String(ThemeConfigMaxBytes)})`,
    );
  }

  const appearance = config.appearance;
  if (appearance === undefined || appearance === null) return;
  if (typeof appearance !== 'object' || Array.isArray(appearance)) {
    throw new Error('appearance must be an object');
  }
  const a = appearance as { mode?: unknown; font?: unknown; style?: unknown; colors?: unknown };

  if (typeof a.mode === 'string' && a.mode !== '' && !SiteThemes.has(a.mode)) {
    throw new Error(`invalid appearance.mode "${a.mode}"`);
  }
  if (typeof a.font === 'string' && a.font !== '' && !SiteFonts.has(a.font)) {
    throw new Error(`invalid appearance.font "${a.font}"`);
  }
  if (typeof a.style === 'string' && a.style !== '' && !SiteStyles.has(a.style)) {
    throw new Error(`invalid appearance.style "${a.style}"`);
  }

  if (a.colors === undefined || a.colors === null) return;
  if (typeof a.colors !== 'object' || Array.isArray(a.colors)) {
    throw new Error('appearance.colors must be an object');
  }
  for (const [key, val] of Object.entries(a.colors as Record<string, unknown>)) {
    if (!ThemeColorKeys.has(key)) throw new Error(`unknown color token "${key}"`);
    if (typeof val !== 'string' || !siteHexRe.test(val)) {
      throw new Error(`color "${key}" must be #rrggbb hex, got "${String(val)}"`);
    }
  }
}
