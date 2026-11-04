'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { onUserChanged } from '@/services/firebase/auth';
import { fetchProfile, saveProfile, type Preferences } from '@/services/firebase/profile';
import { useSettingsStore, type SettingsValues } from '@/stores/settingsStore';

const PREF_KEYS = [
  'musicVolume',
  'sfxVolume',
  'animalVolume',
  'muted',
  'quality',
  'reducedMotion',
  'autoMove',
  'analyticsConsent',
] as const;

function preferencesOf(s: SettingsValues): Partial<Preferences> {
  return Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])) as Partial<Preferences>;
}

/**
 * Keeps preferences and display name in the signed-in user's Firestore profile:
 * remote values are applied once after sign-in, then local changes are saved
 * (debounced). Mounted only when accounts are configured.
 */
export function ProfileSync() {
  const locale = useLocale();
  useEffect(() => {
    let unsubscribeSettings: (() => void) | undefined;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let offAuth: (() => void) | undefined;
    void onUserChanged(async (user) => {
      unsubscribeSettings?.();
      unsubscribeSettings = undefined;
      if (!user) return;
      try {
        const remote = await fetchProfile(user.uid);
        const patch: Partial<SettingsValues> = { ...(remote?.preferences ?? {}) };
        if (remote?.displayName) patch.displayName = remote.displayName;
        delete (patch as { locale?: string }).locale;
        if (Object.keys(patch).length) useSettingsStore.getState().update(patch);
      } catch {
        /* offline or not permitted: keep local settings */
      }
      unsubscribeSettings = useSettingsStore.subscribe((s) => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          void saveProfile(user.uid, {
            ...(s.displayName ? { displayName: s.displayName } : {}),
            preferences: { ...preferencesOf(s), locale },
          }).catch(() => undefined);
        }, 1000);
      });
    }).then((off) => {
      offAuth = off;
    });
    return () => {
      offAuth?.();
      unsubscribeSettings?.();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [locale]);
  return null;
}
