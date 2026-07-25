// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// i18n dict-ийн mn/en түлхүүр паритетийн тест. CLAUDE.md конвенц: түлхүүр бүр
// хоёр хэлэнд ЗААВАЛ байх ёстой — энэ тест дутуу орчуулгыг CI-д барина.
import { describe, it, expect } from 'vitest';
import { dict } from './i18n';

describe('i18n dictionary parity', () => {
  const mnKeys = Object.keys(dict.mn).sort();
  const enKeys = Object.keys(dict.en).sort();

  it('mn and en have the exact same key set', () => {
    const missingInEn = mnKeys.filter((k) => !(k in dict.en));
    const missingInMn = enKeys.filter((k) => !(k in dict.mn));
    expect(missingInEn, `en-д дутуу түлхүүрүүд: ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInMn, `mn-д дутуу түлхүүрүүд: ${missingInMn.join(', ')}`).toEqual([]);
  });

  it('no key has an empty translation', () => {
    for (const lang of ['mn', 'en'] as const) {
      const table = dict[lang] as Record<string, string>;
      for (const [k, v] of Object.entries(table)) {
        expect(typeof v, `${lang}.${k} нь string байх ёстой`).toBe('string');
        expect(v.trim().length, `${lang}.${k} хоосон байна`).toBeGreaterThan(0);
      }
    }
  });
});
