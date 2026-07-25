"use client";

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Client талын нийтлэг provider-ууд. TanStack Query — BFF GET өгөгдлийг
 * кэшлэх, давхар хүсэлтийг нэгтгэх (deduplication), mutation-ы дараа
 * invalidate хийх нэгдсэн зам.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
