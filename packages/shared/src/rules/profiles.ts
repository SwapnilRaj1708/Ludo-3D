import { z } from 'zod';
import {
  START_TRACK_INDICES,
  STAR_TRACK_INDICES,
} from '../board/topology';
import type { RuleSet, SafeSquarePreset } from './types';

/**
 * Default profile. Mirrors the rules most Indian digital Ludo players expect,
 * with the blockade rule from the traditional board game enabled as required
 * by the product specification. Documented in docs/GAME_RULES.md §3.
 */
export const CLASSIC_INDIAN_DIGITAL: RuleSet = Object.freeze({
  id: 'classic-indian-digital',
  formatVersion: 1,
  entryRolls: [6],
  bonusRoll: {
    onSix: true,
    onCapture: true,
    onFinish: true,
    maxPerMove: 1,
    onSixWithoutMove: true,
  },
  consecutiveSixes: { limit: 3, policy: 'forfeit-roll' },
  blockade: { enabled: true, minPieces: 2, blocksPassing: true, blocksLanding: true },
  safeSquares: 'starts-and-stars',
  endCondition: 'all-but-one',
}) as RuleSet;

/** Same as the default but without blockades — a common casual-app variant. */
export const OPEN_TRACK: RuleSet = Object.freeze({
  ...CLASSIC_INDIAN_DIGITAL,
  id: 'open-track',
  blockade: { enabled: false, minPieces: 2, blocksPassing: false, blocksLanding: false },
}) as RuleSet;

/** Shorter matches: the first player to bring all four animals home wins. */
export const QUICK_FINISH: RuleSet = Object.freeze({
  ...CLASSIC_INDIAN_DIGITAL,
  id: 'quick-finish',
  endCondition: 'first-winner',
}) as RuleSet;

export const RULE_PROFILES: Readonly<Record<string, RuleSet>> = Object.freeze({
  [CLASSIC_INDIAN_DIGITAL.id]: CLASSIC_INDIAN_DIGITAL,
  [OPEN_TRACK.id]: OPEN_TRACK,
  [QUICK_FINISH.id]: QUICK_FINISH,
});

export const DEFAULT_RULE_PROFILE_ID = CLASSIC_INDIAN_DIGITAL.id;

export function getRuleProfile(id: string): RuleSet | undefined {
  return Object.prototype.hasOwnProperty.call(RULE_PROFILES, id) ? RULE_PROFILES[id] : undefined;
}

export function safeTrackIndices(preset: SafeSquarePreset): ReadonlySet<number> {
  switch (preset) {
    case 'starts-and-stars':
      return new Set([...START_TRACK_INDICES, ...STAR_TRACK_INDICES]);
    case 'starts-only':
      return new Set(START_TRACK_INDICES);
    case 'none':
      return new Set();
  }
}

const diceValueSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

/** Validates an untrusted RuleSet (e.g. from saved games or room options). */
export const ruleSetSchema = z.object({
  id: z.string().min(1).max(64),
  formatVersion: z.literal(1),
  entryRolls: z.array(diceValueSchema).min(1).max(6),
  bonusRoll: z.object({
    onSix: z.boolean(),
    onCapture: z.boolean(),
    onFinish: z.boolean(),
    maxPerMove: z.number().int().min(0).max(3),
    onSixWithoutMove: z.boolean(),
  }),
  consecutiveSixes: z.object({
    limit: z.number().int().min(0).max(10),
    policy: z.literal('forfeit-roll'),
  }),
  blockade: z.object({
    enabled: z.boolean(),
    minPieces: z.number().int().min(2).max(4),
    blocksPassing: z.boolean(),
    blocksLanding: z.boolean(),
  }),
  safeSquares: z.enum(['starts-and-stars', 'starts-only', 'none']),
  endCondition: z.enum(['all-but-one', 'first-winner']),
});
