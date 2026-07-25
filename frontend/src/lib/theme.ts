// Government Template Platform V3.0
// Gerege Systems Development Team & Claude AI, 2026.
//
// Landing theme-ийн хуваалцсан төрлүүд. Theme = харагдац (палетр · фонт · стиль ·
// загвар) + landing-ийн бүх текст/цэс (mn/en). Backend-ийн domain_theme.go-той
// нийцнэ; config нь уян хатан (frontend copy.ts/globals.css default дээр deep-merge).

import type { LandingCopy } from '@/components/landing/copy';

/** Theme-д засах боломжтой base өнгөний токенууд (globals.css :root-тэй нийцнэ).
 *  hover/soft/text хувилбарыг globals.css color-mix-ээр гаргана. */
export interface ThemeColors {
  bg?: string;
  surface?: string;
  surface2?: string;
  fg?: string;
  muted?: string;
  border?: string;
  borderStrong?: string;
  danBlue?: string;
  gold?: string;
  success?: string;
  danger?: string;
  /** Landing (нүүр) hero/body-ийн navy дэвсгэр (--lp-navy). App-ын --bg-ээс тусдаа. */
  lpNavy?: string;
  /** Landing-ийн дээд цэс (header/nav)-ийн дэвсгэр (--lp-header) — lpNavy-гаас тусдаа. */
  lpHeader?: string;
}

/** ThemeColors-ийн түлхүүр → globals.css CSS хувьсагч. Bootstrap ба preview
 *  хоёулаа ашиглана. */
export const THEME_COLOR_VARS: Record<keyof ThemeColors, string> = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  fg: '--fg',
  muted: '--muted',
  border: '--border',
  borderStrong: '--border-strong',
  danBlue: '--dan-blue',
  gold: '--gold',
  success: '--success',
  danger: '--danger',
  lpNavy: '--lp-navy',
  lpHeader: '--lp-header',
};

export interface ThemeAppearance {
  mode?: 'light' | 'dark' | 'system';
  font?: 'inter' | 'serif' | 'system';
  style?: 'comfortable' | 'compact';
  colors?: ThemeColors;
}

export interface ThemeConfig {
  appearance?: ThemeAppearance;
  landing?: { mn?: Partial<LandingCopy>; en?: Partial<LandingCopy> };
}

/** Backend-ээс ирэх нэрлэсэн theme (жагсаалт/CRUD). */
export interface Theme {
  id: string;
  name: string;
  config: ThemeConfig;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export const EMPTY_THEME_CONFIG: ThemeConfig = { appearance: {}, landing: {} };

/** globals.css :root-ийн light токенуудын hex ойролцоолол — editor-ийн өнгө
 *  сонгогчийг урьдчилан бөглөх ба preview-д ашиглана. */
export const DEFAULT_PALETTE: Required<ThemeColors> = {
  bg: '#fafafb',
  surface: '#ffffff',
  surface2: '#f1f3f6',
  fg: '#202632',
  muted: '#6c7480',
  border: '#e6e8ed',
  borderStrong: '#c6cbd4',
  danBlue: '#1767e7',
  gold: '#c39a4e',
  success: '#279a5b',
  danger: '#ce3f3d',
  lpNavy: '#0f1f39',
  lpHeader: '#0f1f39',
};

/** Өнгө сонгогчийн эрэмбэ + шошго (mn). */
export const THEME_COLOR_FIELDS: { key: keyof ThemeColors; labelMn: string; labelEn: string }[] = [
  { key: 'danBlue', labelMn: 'Гол өнгө (brand)', labelEn: 'Primary (brand)' },
  { key: 'gold', labelMn: 'Алт (итгэл)', labelEn: 'Gold (trust)' },
  { key: 'lpHeader', labelMn: 'Нүүр — толгой (header)', labelEn: 'Landing — header' },
  { key: 'lpNavy', labelMn: 'Нүүр — үлдсэн (body)', labelEn: 'Landing — body' },
  { key: 'bg', labelMn: 'Дэвсгэр', labelEn: 'Background' },
  { key: 'surface', labelMn: 'Гадаргуу', labelEn: 'Surface' },
  { key: 'surface2', labelMn: 'Гадаргуу-2', labelEn: 'Surface 2' },
  { key: 'fg', labelMn: 'Текст', labelEn: 'Text' },
  { key: 'muted', labelMn: 'Бүдэг текст', labelEn: 'Muted text' },
  { key: 'border', labelMn: 'Зураас', labelEn: 'Border' },
  { key: 'borderStrong', labelMn: 'Тод зураас', labelEn: 'Strong border' },
  { key: 'success', labelMn: 'Амжилт', labelEn: 'Success' },
  { key: 'danger', labelMn: 'Анхаар', labelEn: 'Danger' },
];

/** Гүн merge (жижиг, JSON-safe) — override-ыг base дээр давхарлана. Массивыг
 *  элемент-тус-бүрээр нэгтгэнэ: override[i] байвал давамгайлж, нүх (undefined)
 *  байвал base[i]-ээс дүүргэнэ. Ингэснээр зөвхөн нэг мөр засагдсан ч бусад нь
 *  алга болохгүй (override-ийн уртаар — устгасныг хүндэлнэ). */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) && Array.isArray(override)) {
    const out: unknown[] = [];
    for (let i = 0; i < override.length; i++) {
      out[i] = override[i] === undefined ? (base as unknown[])[i] : deepMerge((base as unknown[])[i], override[i]);
    }
    return out as T;
  }
  // Төрөл зөрвөл (нэг нь массив, нөгөө нь биш): массив base-ыг буруу override-оор
  // бүү алдагтун — base-ыг хадгална; override массив бол түүнийг ав.
  if (Array.isArray(base)) return Array.isArray(override) ? (override as T) : base;
  if (Array.isArray(override)) return override as T;
  if (typeof base !== 'object' || typeof override !== 'object') return (override as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && v && typeof v === 'object'
      ? deepMerge(b, v)
      : v;
  }
  return out as T;
}
