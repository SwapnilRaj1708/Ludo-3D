'use client';

import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;
}

/** Effective reduced-motion preference: the in-game setting overrides the OS. */
export function useReducedMotion(): boolean {
  const setting = useSettingsStore((s) => s.reducedMotion);
  const system = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return setting === 'system' ? system : setting === 'on';
}
