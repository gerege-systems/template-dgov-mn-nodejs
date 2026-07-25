// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * SiteAppearance нь сайтын НИЙТИЙН харагдацын default — админ тохируулж, бүх
 * зочин үүгээр эхэлнэ. accent нь preset нэр ЭСВЭЛ '#rrggbb' custom hex.
 */
export interface SiteAppearance {
  accent: string;
  font: string;
  style: string;
  theme: string;
  updatedAt: Date | null;
}

// Зөвшөөрөгдсөн утгууд — frontend-ийн preset жагсаалттай НЭГ МӨР байх ёстой
// (globals.css html[data-*], preferences.ts).
export const SiteAccentPresets = new Set(['cobalt', 'teal', 'violet', 'emerald', 'amber']);
export const SiteFonts = new Set(['inter', 'serif', 'system']);
export const SiteStyles = new Set(['comfortable', 'compact']);
export const SiteThemes = new Set(['light', 'dark', 'system']);

/**
 * siteHexRe нь custom accent-ийн '#rrggbb' хэлбэрийг шалгана. 3-оронтой хэлбэр
 * ЗӨВШӨӨРӨХГҮЙ — frontend нь 6-оронтойг л илгээдэг тул хүрээг нарийн барина.
 */
export const siteHexRe = /^#[0-9a-fA-F]{6}$/;

/** defaultSiteAppearance нь seed/fallback утга (repo уншиж чадаагүй үед ч). */
export function defaultSiteAppearance(): SiteAppearance {
  return { accent: 'cobalt', font: 'inter', style: 'comfortable', theme: 'light', updatedAt: null };
}

/** validSiteAccent нь preset нэр эсвэл '#rrggbb' hex мөр эсэхийг шалгана. */
export function validSiteAccent(accent: string): boolean {
  return SiteAccentPresets.has(accent) || siteHexRe.test(accent);
}
