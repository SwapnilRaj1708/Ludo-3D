'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/utils/storage';

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';
export type ReducedMotionSetting = 'system' | 'on' | 'off';

export interface SettingsValues {
  musicVolume: number;
  sfxVolume: number;
  animalVolume: number;
  muted: boolean;
  quality: QualitySetting;
  reducedMotion: ReducedMotionSetting;
  autoMove: boolean;
  displayName: string;
}

interface SettingsStore extends SettingsValues {
  hydrated: boolean;
  update: (patch: Partial<SettingsValues>) => void;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  musicVolume: 0.35,
  sfxVolume: 0.8,
  animalVolume: 0.7,
  muted: false,
  quality: 'auto',
  reducedMotion: 'system',
  autoMove: true,
  displayName: '',
};

const clamp01 = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

/** Player preferences, persisted per device (and to the profile when signed in). */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      hydrated: false,
      update: (patch) => set(patch),
    }),
    {
      name: 'ludo3d.settings.v1',
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      partialize: ({ hydrated: _h, update: _u, ...values }) => values,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsValues>;
        return {
          ...current,
          musicVolume: clamp01(p.musicVolume, current.musicVolume),
          sfxVolume: clamp01(p.sfxVolume, current.sfxVolume),
          animalVolume: clamp01(p.animalVolume, current.animalVolume),
          muted: typeof p.muted === 'boolean' ? p.muted : current.muted,
          quality: ['auto', 'low', 'medium', 'high'].includes(p.quality as string)
            ? (p.quality as QualitySetting)
            : current.quality,
          reducedMotion: ['system', 'on', 'off'].includes(p.reducedMotion as string)
            ? (p.reducedMotion as ReducedMotionSetting)
            : current.reducedMotion,
          autoMove: typeof p.autoMove === 'boolean' ? p.autoMove : current.autoMove,
          displayName: typeof p.displayName === 'string' ? p.displayName.slice(0, 40) : '',
        };
      },
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);
