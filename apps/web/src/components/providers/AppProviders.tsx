'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastRegion } from './ToastRegion';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  useEffect(() => {
    // Settings are persisted in localStorage; rehydrate after mount so the
    // server-rendered HTML (defaults) and the first client render agree.
    void useSettingsStore.persist.rehydrate();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastRegion />
    </QueryClientProvider>
  );
}
