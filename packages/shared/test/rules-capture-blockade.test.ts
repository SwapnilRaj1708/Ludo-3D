import { describe, expect, it } from 'vitest';
import {
  CLASSIC_INDIAN_DIGITAL,
  OPEN_TRACK,
  applyAction,
  getLegalMoves,
  type RuleSet,
} from '../src';
import { eventTypes, move, progressOf, roll, scenario } from './helpers';

const withRules = (patch: Partial<RuleSet>): RuleSet => ({ ...CLASSIC_INDIAN_DIGITAL, ...patch });

// Global track indices used below: yellow progress p = global p.
// green progress p = global (13 + p) % 52. Safe: 0, 8, 13, 21, 26, 34, 39, 47.

describe('captures', () => {
  it('sends a lone opponent on an unprotected square back to its yard', () => {
    const state = scenario({ pieces: { 'yellow-0': 12, 'green-0': 2 } }); // green-0 on 15
    const moved = move(roll(state, 3).state, 'yellow-0');
    expect(progressOf(moved.state, 'green-0')).toBe(-1);
    expect(progressOf(moved.state, 'yellow-0')).toBe(15);
    expect(moved.events[1]).toMatchObject({
      type: 'piece-captured',
      pieceId: 'yellow-0',
      victimId: 'green-0',
      victimSeat: 1,
      victimFrom: 2,
      trackIndex: 15,
    });
    expect(moved.state.players.find((p) => p.seat === 0)?.captures).toBe(1);
  });

  it('reports captures in legal-move generation', () => {
    const state = scenario({ pieces: { 'yellow-0': 12, 'green-0': 2 } });
    expect(getLegalMoves(state, 0, 3)[0]?.captures).toEqual(['green-0']);
  });

  it('does not capture on star squares — both pieces share it', () => {
    const state = scenario({ pieces: { 'yellow-0': 17, 'green-0': 8 } }); // green on 21 (star)
    const moved = move(roll(state, 4).state, 'yellow-0');
    expect(eventTypes(moved.events)).not.toContain('piece-captured');
    expect(progressOf(moved.state, 'green-0')).toBe(8);
    expect(progressOf(moved.state, 'yellow-0')).toBe(21);
  });

  it('does not capture on start squares', () => {
    const state = scenario({ pieces: { 'yellow-0': 10, 'green-0': 0 } }); // green start = 13
    const moved = move(roll(state, 3).state, 'yellow-0');
    expect(progressOf(moved.state, 'green-0')).toBe(0);
  });

  it('never captures own pieces — they stack instead', () => {
    const state = scenario({ pieces: { 'yellow-0': 10, 'yellow-1': 14 } });
    const moved = move(roll(state, 4).state, 'yellow-0');
    expect(progressOf(moved.state, 'yellow-1')).toBe(14);
    expect(progressOf(moved.state, 'yellow-0')).toBe(14);
    expect(eventTypes(moved.events)).not.toContain('piece-captured');
  });

  it('requires a captured piece to roll a six to re-enter', () => {
    let state = scenario({ pieces: { 'yellow-0': 12, 'green-0': 2 } });
    state = move(roll(state, 3).state, 'yellow-0').state; // capture, bonus
    state = move(roll(state, 1).state, 'yellow-0').state; // yellow uses bonus; turn → green
    expect(state.turn.seat).toBe(1);
    const greenFive = roll(state, 5);
    expect(eventTypes(greenFive.events)).toContain('no-legal-moves');
    const greenSix = roll({ ...state }, 6);
    expect(getLegalMoves(greenSix.state, 1, 6).map((m) => m.pieceId)).toContain('green-0');
  });

  it('captures on entry when start squares are not protected', () => {
    const rules = withRules({ safeSquares: 'none' });
    // green progress 39 = global 0 (yellow's start square)
    const state = scenario({ rules, pieces: { 'green-0': 39 } });
    const moved = move(roll(state, 6).state, 'yellow-0');
    expect(moved.events[1]).toMatchObject({ type: 'piece-captured', victimId: 'green-0' });
  });

  it('starts-only preset leaves stars unprotected', () => {
    const rules = withRules({ safeSquares: 'starts-only' });
    const state = scenario({ rules, pieces: { 'yellow-0': 17, 'green-0': 8 } }); // global 21
    const moved = move(roll(state, 4).state, 'yellow-0');
    expect(progressOf(moved.state, 'green-0')).toBe(-1);
  });

  it('captures every piece of a stack when blockades are disabled', () => {
    const state = scenario({
      rules: OPEN_TRACK,
      pieces: { 'yellow-0': 12, 'green-0': 2, 'green-1': 2 },
    });
    const moved = move(roll(state, 3).state, 'yellow-0');
    expect(moved.events.filter((e) => e.type === 'piece-captured')).toHaveLength(2);
    expect(progressOf(moved.state, 'green-0')).toBe(-1);
    expect(progressOf(moved.state, 'green-1')).toBe(-1);
    // Still one bonus roll for the capture move.
    expect(moved.state.turn.rollsRemaining).toBe(1);
  });
});

describe('blockades', () => {
  // Two green pieces on global 15 (green progress 2).
  const blocked = scenario({ pieces: { 'yellow-0': 12, 'green-0': 2, 'green-1': 2 } });

  it('prevents opponents from landing on a blockade', () => {
    expect(getLegalMoves(blocked, 0, 3)).toHaveLength(0);
  });

  it('prevents opponents from passing a blockade', () => {
    expect(getLegalMoves(blocked, 0, 5)).toHaveLength(0);
    expect(getLegalMoves(blocked, 0, 6).filter((m) => m.pieceId === 'yellow-0')).toHaveLength(0);
  });

  it('allows moves that stop before the blockade', () => {
    expect(getLegalMoves(blocked, 0, 2).map((m) => m.to)).toEqual([14]);
  });

  it('auto-passes when the only piece is blocked', () => {
    const result = roll(blocked, 4);
    expect(eventTypes(result.events)).toEqual(['dice-rolled', 'no-legal-moves', 'turn-started']);
  });

  it('lets the owner pass through and land on their own blockade', () => {
    const own = scenario({ pieces: { 'yellow-0': 10, 'yellow-1': 14, 'yellow-2': 14 } });
    expect(getLegalMoves(own, 0, 4).map((m) => m.pieceId)).toContain('yellow-0');
    expect(getLegalMoves(own, 0, 6).map((m) => m.pieceId)).toContain('yellow-0');
  });

  it('also blocks on safe squares', () => {
    const star = scenario({ pieces: { 'yellow-0': 18, 'green-0': 8, 'green-1': 8 } }); // global 21
    expect(getLegalMoves(star, 0, 3)).toHaveLength(0);
    expect(getLegalMoves(star, 0, 5)).toHaveLength(0);
  });

  it('blocks entry onto a start square occupied by an opponent blockade', () => {
    // green progress 39 = global 0 (yellow start, safe)
    const state = scenario({ pieces: { 'green-0': 39, 'green-1': 39 } });
    expect(getLegalMoves(state, 0, 6)).toHaveLength(0);
    const rolled = roll(state, 6);
    // The unusable six still grants its bonus roll.
    expect(eventTypes(rolled.events)).toEqual(['dice-rolled', 'no-legal-moves', 'bonus-roll']);
  });

  it('does not treat two different colours on a safe square as a blockade', () => {
    // green-0 at global 21 (progress 8), red-0 at global 21 (red progress 47)
    const mixed = scenario({ pieces: { 'yellow-0': 18, 'green-0': 8, 'red-0': 47 } });
    expect(getLegalMoves(mixed, 0, 3).map((m) => m.to)).toEqual([21]);
  });

  it('is configurable: passing allowed but landing forbidden', () => {
    const rules = withRules({
      blockade: { enabled: true, minPieces: 2, blocksPassing: false, blocksLanding: true },
    });
    const state = scenario({ rules, pieces: { 'yellow-0': 12, 'green-0': 2, 'green-1': 2 } });
    expect(getLegalMoves(state, 0, 3)).toHaveLength(0);
    expect(getLegalMoves(state, 0, 5).map((m) => m.to)).toEqual([17]);
  });

  it('can be disabled entirely', () => {
    const state = scenario({
      rules: OPEN_TRACK,
      pieces: { 'yellow-0': 12, 'green-0': 2, 'green-1': 2 },
    });
    expect(getLegalMoves(state, 0, 5).map((m) => m.to)).toEqual([17]);
  });

  it('does not let departed players block the track', () => {
    let state = scenario({ pieces: { 'yellow-0': 12, 'green-0': 2, 'green-1': 2 } });
    const left = applyAction(state, { type: 'leave', seat: 1 });
    expect(left.ok).toBe(true);
    if (left.ok) state = left.state;
    expect(getLegalMoves(state, 0, 5).map((m) => m.to)).toEqual([17]);
  });
});
