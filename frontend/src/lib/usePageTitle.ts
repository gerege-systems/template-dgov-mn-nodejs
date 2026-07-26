// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { useEffect } from 'react';

/** siteName нь хуудасны гарчгийн суурь нэр. */
const siteName = 'Government Template Platform V3.0';

/**
 * usePageTitle нь баримтын гарчгийг тавина (Next.js-ийн `metadata`-г орлоно).
 * Хуудсаас гарахад өмнөх гарчгийг сэргээнэ.
 */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title === undefined || title === '' ? siteName : `${title} — ${siteName}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
