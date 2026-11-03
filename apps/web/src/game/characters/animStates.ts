/** The ten animation states every animal supports (product spec §7). */
export const ANIM_STATES = [
  'idle',
  'anticipation',
  'walk',
  'run',
  'entry',
  'land',
  'attack',
  'react',
  'returnHome',
  'victory',
] as const;
export type AnimState = (typeof ANIM_STATES)[number];

/** Looping states keep playing until replaced; the rest play once. */
export const LOOPING_STATES: ReadonlySet<AnimState> = new Set([
  'idle',
  'anticipation',
  'walk',
  'run',
  'returnHome',
  'victory',
]);

/**
 * If an asset lacks a clip, these fallbacks are tried in order. Missing clips
 * are reported by the asset library and listed in docs/ASSET_MANIFEST.md.
 */
export const ANIM_FALLBACKS: Record<AnimState, readonly AnimState[]> = {
  idle: [],
  anticipation: ['idle'],
  walk: ['run', 'idle'],
  run: ['walk', 'idle'],
  entry: ['land', 'run', 'idle'],
  land: ['idle'],
  attack: ['run', 'walk', 'idle'],
  react: ['idle'],
  returnHome: ['run', 'walk', 'idle'],
  victory: ['idle'],
};

/** Default clip names used by the generated proxies (and recommended for final assets). */
export const DEFAULT_CLIP_NAMES: Record<AnimState, string> = {
  idle: 'Idle',
  anticipation: 'Anticipation',
  walk: 'Walk',
  run: 'Run',
  entry: 'Entry',
  land: 'Land',
  attack: 'Attack',
  react: 'React',
  returnHome: 'ReturnHome',
  victory: 'Victory',
};
