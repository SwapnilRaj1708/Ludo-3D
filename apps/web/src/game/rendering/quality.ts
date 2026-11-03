import type { QualitySetting } from '@/stores/settingsStore';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  level: QualityLevel;
  /** Device-pixel-ratio range handed to the renderer. */
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Soft contact shadow under each piece (cheap fake used when shadow maps are off). */
  blobShadows: boolean;
  boardTextureSize: number;
  woodTextureSize: number;
  anisotropy: number;
  /** Screen-space ambient occlusion + subtle bloom/vignette. */
  postProcessing: boolean;
  /** Environment map resolution for reflections. */
  envMapSize: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low',
    dpr: [1, 1.25],
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    blobShadows: true,
    boardTextureSize: 1024,
    woodTextureSize: 256,
    anisotropy: 1,
    postProcessing: false,
    envMapSize: 64,
  },
  medium: {
    level: 'medium',
    dpr: [1, 1.75],
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    blobShadows: false,
    boardTextureSize: 2048,
    woodTextureSize: 512,
    anisotropy: 4,
    postProcessing: false,
    envMapSize: 128,
  },
  high: {
    level: 'high',
    dpr: [1, 2],
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    blobShadows: false,
    boardTextureSize: 2048,
    woodTextureSize: 1024,
    anisotropy: 8,
    postProcessing: true,
    envMapSize: 256,
  },
};

/**
 * Initial guess for "auto": phones and low-memory devices start at medium,
 * desktops at high. A runtime FPS monitor then steps down if needed.
 */
export function detectQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 3;
  const cores = nav.hardwareConcurrency ?? 4;
  if (lowMemory || cores <= 2) return 'low';
  if (mobile) return 'medium';
  return 'high';
}

export function resolveQuality(setting: QualitySetting, detected: QualityLevel): QualityProfile {
  return QUALITY_PROFILES[setting === 'auto' ? detected : setting];
}

export function stepDown(level: QualityLevel): QualityLevel {
  return level === 'high' ? 'medium' : 'low';
}
