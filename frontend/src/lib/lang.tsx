"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { t, permLabel, roleName, type DictKey, type Lang } from './i18n';

const LANG_KEY = 'gerege.lang';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx>({ lang: 'mn', setLang: () => {} });

/**
 * LangProvider нь хэлийг (mn/en) бүхэл аппд хуваалцана. Компонент бүр тусдаа
 * state барих биш, нэг context-оос уншдаг тул UserMenu-д хэл солиход цэс болон
 * бүх контент шууд шинэчлэгдэнэ. localStorage 'gerege.lang'-д хадгална.
 */
export function LangProvider({ children }: { children: React.ReactNode }) {
  // SSR-тэй тохирохын тулд 'mn'-ээс эхэлж, дараа нь localStorage-аас синк хийнэ.
  const [lang, setLangState] = useState<Lang>('mn');

  useEffect(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (v === 'mn' || v === 'en') setLangState(v);
    } catch {
      /* localStorage хүрэхгүй — өгөгдмөл mn */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* no-op */
    }
    if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', l);
  }, []);

  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}

/** useT нь одоогийн хэлээр орчуулах функцууд + lang-г буцаана.
 *  T(key) — статик dictionary түлхүүр;
 *  tRole(key, fallback) — backend role нэр (admin/user/manager);
 *  tPerm(key, fallback) — backend permission label. */
export function useT() {
  const { lang } = useLang();
  return {
    lang,
    T: (key: DictKey) => t(lang, key),
    tRole: (roleKey: string, fallback: string) => roleName(lang, roleKey, fallback),
    tPerm: (permKey: string, fallback: string) => permLabel(lang, permKey, fallback),
  };
}
