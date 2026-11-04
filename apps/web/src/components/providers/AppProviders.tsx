'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { analytics } from '@/services/analytics';
import { installGlobalErrorHandlers } from '@/services/errors';
import { useSettingsStore } from '@/stores/settingsStore';
import { publicConfig } from '@/services/config';
import { ProfileSync } from './ProfileSync';
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
    const apply = (consent: boolean) => analytics.setConsent(consent);
    void Promise.resolve(useSettingsStore.persist.rehydrate()).then(() => {
      apply(useSettingsStore.getState().analyticsConsent);
      analytics.track({ name: 'app_opened' });
    });
    const uninstall = installGlobalErrorHandlers();
    const unsubscribe = useSettingsStore.subscribe((s) => apply(s.analyticsConsent));
    return () => {
      uninstall();
      unsubscribe();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {publicConfig.firebase ? <ProfileSync /> : null}
      <ToastRegion />
    </QueryClientProvider>
  );
}
