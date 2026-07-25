// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { useQueryClient } from '@tanstack/react-query';

/**
 * useRefreshData нь Next.js-ийн `router.refresh()`-ийн SPA дахь дүйцэл:
 * серверийн шинэ хариу авахын тулд бүх идэвхтэй query-г хүчингүй болгоно.
 * (Next.js-д server component дахин зурагддаг байсан; SPA-д кэш л шинэчлэгдэнэ.)
 */
export function useRefreshData(): () => Promise<void> {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries();
  };
}
