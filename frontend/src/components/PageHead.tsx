"use client";

import React from 'react';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';

/** Орчуулагддаг хуудасны толгой — eyebrow / гарчиг / дэд тайлбар (бүгд i18n key). */
export default function PageHead({
  eyebrowKey, titleKey, subKey,
}: { eyebrowKey: DictKey; titleKey: DictKey; subKey?: DictKey }) {
  const { T } = useT();
  return (
    <div className="page-head">
      <span className="page-head__eyebrow">{T(eyebrowKey)}</span>
      <h1>{T(titleKey)}</h1>
      {subKey && <p className="page-head__sub">{T(subKey)}</p>}
    </div>
  );
}
