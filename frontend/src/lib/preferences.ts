"use client";

import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export type LangPref = 'mn' | 'en';
// Харагдацын нэмэлт тохиргоо — токеноор дамжина (globals.css-д html[data-*]).
export type AccentPref = 'cobalt' | 'teal' | 'violet' | 'emerald' | 'amber';
export type FontPref = 'inter' | 'serif' | 'system';
export type StylePref = 'comfortable' | 'compact';

const KEYS = {
  theme: 'gerege.theme',
  lang: 'gerege.lang',
  accent: 'gerege.accent',
  font: 'gerege.font',
  style: 'gerege.style',
} as const;

// Анхдагч утгууд — theme-bootstrap.js доторх fallback-тэй ижил байх ёстой.
export const DEFAULTS = {
  theme: 'light' as ThemePref,
  lang: 'mn' as LangPref,
  accent: 'cobalt' as AccentPref,
  font: 'inter' as FontPref,
  style: 'comfortable' as StylePref,
};

const VALID = {
  theme: new Set<ThemePref>(['light', 'dark', 'system']),
  lang: new Set<LangPref>(['mn', 'en']),
  accent: new Set<AccentPref>(['cobalt', 'teal', 'violet', 'emerald', 'amber']),
  font: new Set<FontPref>(['inter', 'serif', 'system']),
  style: new Set<StylePref>(['comfortable', 'compact']),
};

const read = <T extends string>(storageKey: string, fallback: T, valid: Set<T>): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(storageKey) as T | null;
    return v && valid.has(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

const applyTheme = (value: ThemePref) => {
  if (typeof document === 'undefined') return;
  const effective: 'light' | 'dark' =
    value === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : value;
  const root = document.documentElement;
  if (effective === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  root.setAttribute('data-theme-pref', value);
};

const applyLang = (value: LangPref) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('lang', value);
};

// Харагдацын тохиргоо бүр <html>-д data-attribute тавьж globals.css-ийн
// токенуудыг дарж бичүүлнэ. Анхдагч утга ч мөн тавигдана (тод/тодорхой байх).
const applyAccent = (value: AccentPref) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-accent', value);
};
const applyFont = (value: FontPref) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-font', value);
};
const applyStyle = (value: StylePref) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-style', value);
};

/**
 * gerege theme-ийн тохиргоог (загвар · хэл · өнгө · фонт · нягтрал)
 * localStorage-д уншиж/бичээд <html> дээр тусгана. me.dgov.mn-ийн site.js-тэй
 * ижил зарчмаар ажиллана; FOUC-ийг public/theme-bootstrap.js хамгаална.
 */
export function usePreferences() {
  // Inline-bootstrap утгаас эхэлснээр SSR markup эхний client render-тэй тохирно
  // (hydration зөрөхгүй). useEffect-д localStorage-аас дахин синк хийнэ.
  const [theme, setThemeState] = useState<ThemePref>(DEFAULTS.theme);
  const [lang, setLangState] = useState<LangPref>(DEFAULTS.lang);
  const [accent, setAccentState] = useState<AccentPref>(DEFAULTS.accent);
  const [font, setFontState] = useState<FontPref>(DEFAULTS.font);
  const [style, setStyleState] = useState<StylePref>(DEFAULTS.style);

  useEffect(() => {
    // Хэрэглэгчийн тохиргоо нь ЗӨВХӨН нэвтэрсэн апп-д үйлчилнэ (админы сайт-
    // default-аас хамааралгүй). localStorage хоосон бол template default.
    setThemeState(read(KEYS.theme, DEFAULTS.theme, VALID.theme));
    setLangState(read(KEYS.lang, DEFAULTS.lang, VALID.lang));
    setAccentState(read(KEYS.accent, DEFAULTS.accent, VALID.accent));
    setFontState(read(KEYS.font, DEFAULTS.font, VALID.font));
    setStyleState(read(KEYS.style, DEFAULTS.style, VALID.style));
  }, []);

  // OS загвар солигдоход "system" дээр байвал дахин тусгана.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((value: ThemePref) => {
    if (!VALID.theme.has(value)) return;
    setThemeState(value);
    try { localStorage.setItem(KEYS.theme, value); } catch {}
    applyTheme(value);
  }, []);

  const setLang = useCallback((value: LangPref) => {
    if (!VALID.lang.has(value)) return;
    setLangState(value);
    try { localStorage.setItem(KEYS.lang, value); } catch {}
    applyLang(value);
  }, []);

  const setAccent = useCallback((value: AccentPref) => {
    if (!VALID.accent.has(value)) return;
    setAccentState(value);
    try { localStorage.setItem(KEYS.accent, value); } catch {}
    applyAccent(value);
  }, []);

  const setFont = useCallback((value: FontPref) => {
    if (!VALID.font.has(value)) return;
    setFontState(value);
    try { localStorage.setItem(KEYS.font, value); } catch {}
    applyFont(value);
  }, []);

  const setStyle = useCallback((value: StylePref) => {
    if (!VALID.style.has(value)) return;
    setStyleState(value);
    try { localStorage.setItem(KEYS.style, value); } catch {}
    applyStyle(value);
  }, []);

  return {
    theme, setTheme,
    lang, setLang,
    accent, setAccent,
    font, setFont,
    style, setStyle,
  };
}

/** Жижиг toast туслах — globals.css дахь .toast класс ашиглана. */
export function showToast(message: string) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector<HTMLDivElement>('.toast[data-app-toast]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.dataset.appToast = '1';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => el!.classList.add('is-visible'));
  window.clearTimeout((el as unknown as { _t: number })._t);
  (el as unknown as { _t: number })._t = window.setTimeout(() => el!.classList.remove('is-visible'), 1800);
}
