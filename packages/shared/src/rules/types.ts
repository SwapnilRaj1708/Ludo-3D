export const DICE_VALUES = [1, 2, 3, 4, 5, 6] as const;
export type DiceValue = (typeof DICE_VALUES)[number];

export function isDiceValue(value: unknown): value is DiceValue {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

/**
 * Which track squares protect pieces from capture.
 * - `starts-and-stars`: the four start squares plus the four star squares
 *   eight steps after each start square (classic Indian digital layout).
 * - `starts-only`: only the four start squares.
 * - `none`: no protected track squares (home lanes are always private).
 */
export type SafeSquarePreset = 'starts-and-stars' | 'starts-only' | 'none';

/**
 * - `all-but-one`: play continues after the first player finishes until only
 *   one player is left unfinished, producing a full ranking.
 * - `first-winner`: the match ends as soon as one player finishes; remaining
 *   players are ranked by pieces finished, then by total progress.
 */
export type EndCondition = 'all-but-one' | 'first-winner';

export type BonusReason = 'six' | 'capture' | 'finish';

/**
 * A complete, serialisable description of one Ludo rule variant. The engine
 * reads nothing but this object, so every supported variant is expressible
 * as data. See docs/GAME_RULES.md for the meaning of every field.
 */
export interface RuleSet {
  readonly id: string;
  readonly formatVersion: 1;
  /** Dice values that allow a piece to leave the yard onto its start square. */
  readonly entryRolls: readonly DiceValue[];
  readonly bonusRoll: {
    readonly onSix: boolean;
    readonly onCapture: boolean;
    /** A piece reaching the finishing triangle. */
    readonly onFinish: boolean;
    /** Upper bound on bonus rolls granted by a single move when several reasons apply. */
    readonly maxPerMove: number;
    /** A six that cannot be used for any legal move still grants its bonus roll. */
    readonly onSixWithoutMove: boolean;
  };
  readonly consecutiveSixes: {
    /** Number of consecutive sixes in one turn that triggers the policy. 0 disables it. */
    readonly limit: number;
    /**
     * `forfeit-roll`: the roll that reaches the limit is void, the turn ends
     * immediately, and every move already completed this turn stands.
     */
    readonly policy: 'forfeit-roll';
  };
  readonly blockade: {
    readonly enabled: boolean;
    /** Same-colour pieces needed on one square to form a blockade. */
    readonly minPieces: number;
    /** Opponents may not move past a blockade. */
    readonly blocksPassing: boolean;
    /** Opponents may not finish their move on a blockade. */
    readonly blocksLanding: boolean;
  };
  readonly safeSquares: SafeSquarePreset;
  readonly endCondition: EndCondition;
}
