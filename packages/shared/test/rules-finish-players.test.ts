import { describe, expect, it } from 'vitest';
import {
  QUICK_FINISH,
  allocateSeats,
  applyAction,
  createGame,
  evaluatePieceMove,
  getLegalMoves,
  nextActiveSeat,
  type GameState,
} from '../src';
import { eventTypes, expectOk, move, progressOf, roll, scenario } from './helpers';

describe('home lane and finishing', () => {
  it('turns into the home lane from relative square 50', () => {
    const state = scenario({ pieces: { 'yellow-0': 48 } });
    const moved = move(roll(state, 5).state, 'yellow-0');
    expect(moved.events[0]).toMatchObject({ path: [49, 50, 51, 52, 53] });
    expect(progressOf(moved.state, 'yellow-0')).toBe(53);
  });

  it('requires the exact number to finish and forbids overshooting', () => {
    const state = scenario({ pieces: { 'yellow-0': 53 } });
    expect(getLegalMoves(state, 0, 3)).toMatchObject([{ kind: 'finish', to: 56 }]);
    expect(getLegalMoves(state, 0, 4)).toHaveLength(0);
    // With a six only the yard pieces may move; yellow-0 would overshoot.
    expect(getLegalMoves(state, 0, 6).map((m) => m.pieceId)).not.toContain('yellow-0');
    expect(getLegalMoves(state, 0, 6).every((m) => m.kind === 'enter')).toBe(true);
  });

  it('does not allow finished pieces to move again', () => {
    const state = scenario({ pieces: { 'yellow-0': 56 } });
    const piece = state.pieces.find((p) => p.id === 'yellow-0')!;
    for (const d of [1, 2, 3, 4, 5, 6] as const) expect(evaluatePieceMove(state, piece, d)).toBeNull();
  });

  it('home lane squares cannot be reached or blocked by opponents', () => {
    // Red sitting on global 50 (yellow home entry, red progress 24) does not block the lane.
    const state = scenario({ pieces: { 'yellow-0': 49, 'red-0': 24 } });
    const moves = getLegalMoves(state, 0, 4);
    expect(moves.map((m) => m.to)).toEqual([53]);
  });

  it('declares the winner when all four animals reach the centre (2 players)', () => {
    const state = scenario({
      seats: [0, 2],
      pieces: { 'yellow-0': 56, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 55, 'red-0': 30 },
    });
    const moved = move(roll(state, 1).state, 'yellow-3');
    expect(eventTypes(moved.events)).toEqual([
      'piece-moved',
      'piece-finished',
      'player-finished',
      'game-over',
    ]);
    expect(moved.state.status).toBe('finished');
    expect(moved.state.winner).toBe(0);
    expect(moved.state.rankings).toEqual([0, 2]);
    expect(moved.state.players.map((p) => p.rank)).toEqual([1, 2]);
    expect(applyAction(moved.state, { type: 'roll', seat: 2, value: 3 })).toMatchObject({
      ok: false,
      error: 'game-over',
    });
  });

  it('continues until one player remains in 4-player all-but-one games', () => {
    let state = scenario({
      pieces: {
        'yellow-0': 56, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 55,
        'green-0': 56, 'green-1': 56, 'green-2': 56, 'green-3': 55,
        'red-0': 56, 'red-1': 56, 'red-2': 56, 'red-3': 55,
        'blue-0': 20,
      },
    });
    state = move(roll(state, 1).state, 'yellow-3').state;
    expect(state.status).toBe('playing');
    expect(state.turn.seat).toBe(1);
    state = move(roll(state, 1).state, 'green-3').state;
    expect(state.turn.seat).toBe(2);
    const last = move(roll(state, 1).state, 'red-3');
    expect(last.state.status).toBe('finished');
    expect(last.state.rankings).toEqual([0, 1, 2, 3]);
    expect(last.state.winner).toBe(0);
  });

  it('skips finished players when passing the turn', () => {
    let state = scenario({
      seats: [0, 1, 2],
      pieces: { 'yellow-0': 56, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 55, 'green-0': 10, 'red-0': 10 },
    });
    state = move(roll(state, 1).state, 'yellow-3').state; // yellow done → green
    state = roll(state, 2).state;
    state = move(state, 'green-0').state; // green → red
    state = roll(state, 2).state;
    state = move(state, 'red-0').state; // red → green (yellow skipped)
    expect(state.turn.seat).toBe(1);
  });

  it('ends at the first winner under the quick-finish profile and ranks the rest', () => {
    const state = scenario({
      rules: QUICK_FINISH,
      seats: [0, 1, 2],
      pieces: {
        'yellow-0': 56, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 55,
        'green-0': 56, 'green-1': 20,
        'red-0': 56, 'red-1': 40,
      },
    });
    const moved = move(roll(state, 1).state, 'yellow-3');
    expect(moved.state.status).toBe('finished');
    // green and red both have one piece home; red has more progress.
    expect(moved.state.rankings).toEqual([0, 2, 1]);
  });
});

describe('player configurations and seat allocation', () => {
  it('uses opposite seats for two players and clockwise order', () => {
    expect(allocateSeats(2)).toEqual([0, 2]);
    const state = createGame({ seats: allocateSeats(2) });
    expect(state.pieces).toHaveLength(8);
    expect(state.pieces.every((p) => p.seat === 0 || p.seat === 2)).toBe(true);
    let s: GameState = state;
    s = roll(s, 3).state;
    expect(s.turn.seat).toBe(2);
    s = roll(s, 3).state;
    expect(s.turn.seat).toBe(0);
  });

  it('uses three distinct seats for three players (configurable)', () => {
    expect(allocateSeats(3)).toEqual([0, 1, 2]);
    expect(allocateSeats(3, [3, 0, 1])).toEqual([0, 1, 3]);
    let s: GameState = createGame({ seats: allocateSeats(3, [0, 1, 3]) });
    const order = [s.turn.seat];
    for (let i = 0; i < 3; i++) {
      s = roll(s, 2).state;
      order.push(s.turn.seat);
    }
    expect(order).toEqual([0, 1, 3, 0]);
  });

  it('uses every seat for four players', () => {
    expect(allocateSeats(4)).toEqual([0, 1, 2, 3]);
    expect(createGame({ seats: [0, 1, 2, 3] }).pieces).toHaveLength(16);
  });

  it('validates seat arrangements and player counts', () => {
    expect(() => allocateSeats(2, [0, 0])).toThrow();
    expect(() => allocateSeats(3, [0, 1])).toThrow();
    expect(() => allocateSeats(2, [0, 7 as never])).toThrow();
    expect(() => createGame({ seats: [0] })).toThrow();
    expect(() => createGame({ seats: [0, 2], firstSeat: 1 })).toThrow();
  });

  it('can start with any participating seat', () => {
    const state = createGame({ seats: [0, 2], firstSeat: 2 });
    expect(state.turn.seat).toBe(2);
  });
});

describe('leaving and abandonment', () => {
  it('removes a leaving player, passes their turn and keeps the match going', () => {
    const state = scenario({ pieces: { 'yellow-0': 10, 'green-0': 5 } });
    const result = expectOk(applyAction(state, { type: 'leave', seat: 0 }));
    expect(eventTypes(result.events)).toEqual(['player-left', 'turn-started']);
    expect(result.state.turn.seat).toBe(1);
    expect(progressOf(result.state, 'yellow-0')).toBe(-1);
    expect(nextActiveSeat(result.state, 3)).toBe(1);
  });

  it('awards the match to the last remaining player', () => {
    const state = scenario({ seats: [0, 2], pieces: { 'yellow-0': 10 } });
    const result = expectOk(applyAction(state, { type: 'leave', seat: 2 }));
    expect(eventTypes(result.events)).toEqual(['player-left', 'game-over']);
    expect(result.state.winner).toBe(0);
    expect(result.state.rankings).toEqual([0, 2]);
  });

  it('ranks departed players last, most recent leaver highest', () => {
    let state = scenario({ pieces: { 'yellow-0': 10 } });
    state = expectOk(applyAction(state, { type: 'leave', seat: 3 })).state;
    state = expectOk(applyAction(state, { type: 'leave', seat: 1 })).state;
    const result = expectOk(applyAction(state, { type: 'leave', seat: 2 }));
    expect(result.state.rankings).toEqual([0, 2, 1, 3]);
  });

  it('lets an off-turn player leave without changing whose turn it is', () => {
    const state = scenario({ pieces: { 'yellow-0': 10 } });
    const result = expectOk(applyAction(state, { type: 'leave', seat: 2 }));
    expect(result.state.turn.seat).toBe(0);
    expect(eventTypes(result.events)).toEqual(['player-left']);
  });

  it('rejects turns from players who left and duplicate leaves', () => {
    const state = expectOk(applyAction(scenario(), { type: 'leave', seat: 1 })).state;
    expect(applyAction(state, { type: 'leave', seat: 1 })).toMatchObject({
      ok: false,
      error: 'player-not-active',
    });
  });
});
