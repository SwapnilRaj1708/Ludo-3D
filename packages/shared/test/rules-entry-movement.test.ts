import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  getLegalMoves,
  movesAreEquivalent,
  type GameState,
} from '../src';
import { eventTypes, move, progressOf, roll, scenario } from './helpers';

describe('starting-yard entry', () => {
  it('requires a six to leave the yard', () => {
    for (const value of [1, 2, 3, 4, 5]) {
      const { state, events } = roll(createGame({ seats: [0, 1, 2, 3] }), value);
      expect(eventTypes(events)).toEqual(['dice-rolled', 'no-legal-moves', 'turn-started']);
      expect(state.turn.seat).toBe(1);
      expect(state.turn.phase).toBe('awaiting-roll');
    }
  });

  it('offers every yard piece on a six and places the chosen one on the start square', () => {
    const after = roll(createGame({ seats: [0, 1, 2, 3] }), 6);
    expect(after.state.turn.phase).toBe('awaiting-move');
    const moves = getLegalMoves(after.state, 0, 6);
    expect(moves.map((m) => m.pieceId)).toEqual(['yellow-0', 'yellow-1', 'yellow-2', 'yellow-3']);
    expect(moves.every((m) => m.kind === 'enter' && m.to === 0)).toBe(true);
    expect(movesAreEquivalent(moves)).toBe(true);

    const entered = move(after.state, 'yellow-2');
    expect(progressOf(entered.state, 'yellow-2')).toBe(0);
    expect(entered.events[0]).toMatchObject({
      type: 'piece-moved',
      pieceId: 'yellow-2',
      kind: 'enter',
      from: -1,
      to: 0,
      path: [0],
    });
  });

  it('honours custom entry values from the rule set', () => {
    const state = scenario({
      rules: { ...createGame({ seats: [0, 2] }).rules, entryRolls: [1, 6] },
      seats: [0, 2],
    });
    expect(getLegalMoves(state, 0, 1)).toHaveLength(4);
    expect(getLegalMoves(state, 0, 2)).toHaveLength(0);
  });
});

describe('movement', () => {
  it('moves exactly the rolled number of squares along the path', () => {
    const state = scenario({ pieces: { 'yellow-0': 10 } });
    const rolled = roll(state, 4);
    const moved = move(rolled.state, 'yellow-0');
    expect(progressOf(moved.state, 'yellow-0')).toBe(14);
    expect(moved.events[0]).toMatchObject({ from: 10, to: 14, path: [11, 12, 13, 14] });
    expect(moved.state.turn.seat).toBe(1);
  });

  it('only lists movable pieces', () => {
    const state = scenario({ pieces: { 'yellow-0': 10, 'yellow-1': 54 } });
    const moves = getLegalMoves(state, 0, 3);
    expect(moves.map((m) => m.pieceId)).toEqual(['yellow-0']); // 54 + 3 overshoots
  });

  it('auto-resolves a roll with no legal move by passing the turn', () => {
    const state = scenario({ pieces: { 'yellow-0': 55 } });
    const { state: next, events } = roll(state, 4);
    expect(eventTypes(events)).toEqual(['dice-rolled', 'no-legal-moves', 'turn-started']);
    expect(next.turn.seat).toBe(1);
    expect(progressOf(next, 'yellow-0')).toBe(55);
  });
});

describe('action validation', () => {
  const base = scenario({ pieces: { 'yellow-0': 10, 'green-0': 5 } });

  it.each([0, 7, -1, 3.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects dice value %s', (value) => {
    const result = applyAction(base, { type: 'roll', seat: 0, value });
    expect(result).toMatchObject({ ok: false, error: 'invalid-dice' });
  });

  it('rejects non-numeric dice values', () => {
    const result = applyAction(base, { type: 'roll', seat: 0, value: '3' as unknown as number });
    expect(result).toMatchObject({ ok: false, error: 'invalid-dice' });
  });

  it('rejects out-of-turn actions', () => {
    expect(applyAction(base, { type: 'roll', seat: 1, value: 3 })).toMatchObject({
      ok: false,
      error: 'not-your-turn',
    });
  });

  it('rejects seats that are not in the match', () => {
    const twoPlayer = createGame({ seats: [0, 2] });
    expect(applyAction(twoPlayer, { type: 'roll', seat: 1, value: 3 })).toMatchObject({
      ok: false,
      error: 'unknown-seat',
    });
    expect(applyAction(twoPlayer, { type: 'roll', seat: 9 as never, value: 3 })).toMatchObject({
      ok: false,
      error: 'unknown-seat',
    });
  });

  it('rejects moving before rolling and rolling while a move is pending', () => {
    expect(applyAction(base, { type: 'move', seat: 0, pieceId: 'yellow-0' })).toMatchObject({
      ok: false,
      error: 'wrong-phase',
    });
    const rolled = roll(base, 3).state;
    expect(applyAction(rolled, { type: 'roll', seat: 0, value: 2 })).toMatchObject({
      ok: false,
      error: 'wrong-phase',
    });
  });

  it("rejects unknown pieces, opponents' pieces and illegal pieces", () => {
    const rolled = roll(base, 3).state;
    expect(applyAction(rolled, { type: 'move', seat: 0, pieceId: 'purple-1' })).toMatchObject({
      ok: false,
      error: 'unknown-piece',
    });
    expect(applyAction(rolled, { type: 'move', seat: 0, pieceId: 'green-0' })).toMatchObject({
      ok: false,
      error: 'not-your-piece',
    });
    expect(applyAction(rolled, { type: 'move', seat: 0, pieceId: 'yellow-1' })).toMatchObject({
      ok: false,
      error: 'illegal-move',
    });
  });

  it('rejects a duplicated command because the state has moved on', () => {
    const rolled = roll(base, 3).state;
    const moved = move(rolled, 'yellow-0').state;
    // Replaying the exact same move against the new state fails cleanly.
    expect(applyAction(moved, { type: 'move', seat: 0, pieceId: 'yellow-0' })).toMatchObject({
      ok: false,
    });
    expect(moved.version).toBe(base.version + 2);
  });

  it('never mutates the input state', () => {
    const snapshot = JSON.stringify(base);
    applyAction(base, { type: 'roll', seat: 0, value: 6 });
    applyAction(base, { type: 'move', seat: 0, pieceId: 'yellow-0' });
    applyAction(base, { type: 'leave', seat: 1 });
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('rejects malformed actions', () => {
    expect(applyAction(base, null as never)).toMatchObject({ ok: false, error: 'invalid-action' });
    expect(applyAction(base, { type: 'fly', seat: 0 } as never)).toMatchObject({
      ok: false,
      error: 'invalid-action',
    });
    const rolled = roll(base, 3).state;
    expect(applyAction(rolled, { type: 'move', seat: 0, pieceId: 7 as never })).toMatchObject({
      ok: false,
      error: 'invalid-action',
    });
  });

  it('increments the version only on accepted actions', () => {
    let state: GameState = base;
    const rejected = applyAction(state, { type: 'roll', seat: 2, value: 3 });
    expect(rejected.ok).toBe(false);
    state = roll(state, 3).state;
    expect(state.version).toBe(1);
  });
});
