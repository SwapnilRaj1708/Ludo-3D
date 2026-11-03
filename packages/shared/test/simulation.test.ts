import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_INDIAN_DIGITAL,
  OPEN_TRACK,
  QUICK_FINISH,
  allocateSeats,
  applyAction,
  checkInvariants,
  createGame,
  createSeededRandom,
  diceFromRandom,
  getCurrentLegalMoves,
  simulateMatch,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerCount,
  type RuleSet,
} from '../src';

/** Rebuilds piece positions purely from the event stream. */
function replayPositions(initial: GameState, events: readonly GameEvent[]): Map<string, number> {
  const positions = new Map(initial.pieces.map((p) => [p.id as string, p.progress]));
  for (const event of events) {
    if (event.type === 'piece-moved') positions.set(event.pieceId, event.to);
    if (event.type === 'piece-captured') positions.set(event.victimId, -1);
    if (event.type === 'player-left') {
      for (const id of positions.keys()) {
        const piece = initial.pieces.find((p) => p.id === id);
        if (piece?.seat === event.seat && positions.get(id) !== 56) positions.set(id, -1);
      }
    }
  }
  return positions;
}

const PROFILES: RuleSet[] = [CLASSIC_INDIAN_DIGITAL, OPEN_TRACK, QUICK_FINISH];

describe('full-match simulations', () => {
  for (const rules of PROFILES) {
    for (const count of [2, 3, 4] as PlayerCount[]) {
      it(`${rules.id}: ${count} bots always finish with consistent state`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const random = createSeededRandom(seed * 7919 + count);
          const initial = createGame({ seats: allocateSeats(count), rules });
          const result = simulateMatch(initial, {
            dice: diceFromRandom(random),
            random,
            difficultyFor: (seat) => (['easy', 'medium', 'hard'] as const)[seat % 3]!,
            onStep: ({ state }) => {
              const violations = checkInvariants(state);
              if (violations.length) throw new Error(`seed ${seed}: ${violations.join('; ')}`);
            },
          });
          expect(result.state.status).toBe('finished');
          expect(result.state.rankings).toHaveLength(count);
          expect(new Set(result.state.rankings).size).toBe(count);
          expect(result.state.winner).toBe(result.state.rankings[0]);
          if (rules.endCondition === 'all-but-one') {
            const finished = result.state.players.filter((p) => p.status === 'finished').length;
            expect(finished).toBe(count - 1);
          }
          // Events alone are enough to reproduce the final board.
          const replayed = replayPositions(initial, result.events);
          for (const piece of result.state.pieces)
            expect(replayed.get(piece.id)).toBe(piece.progress);
          expect(result.events.at(-1)?.type).toBe('game-over');
        }
      });
    }
  }

  it('is deterministic for a given seed', () => {
    const run = () => {
      const random = createSeededRandom(424242);
      return simulateMatch(createGame({ seats: [0, 1, 2, 3] }), {
        dice: diceFromRandom(random),
        random,
      });
    };
    const a = run();
    const b = run();
    expect(a.actions).toBe(b.actions);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  });

  it('produces captures, bonus rolls, forfeits and blockade stalls over many games', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const random = createSeededRandom(seed);
      const { events } = simulateMatch(createGame({ seats: [0, 1, 2, 3] }), {
        dice: diceFromRandom(random),
        random,
      });
      for (const e of events) {
        seen.add(e.type);
        if (e.type === 'bonus-roll') e.reasons.forEach((r) => seen.add(`bonus:${r}`));
      }
    }
    for (const type of [
      'piece-captured',
      'roll-forfeited',
      'no-legal-moves',
      'piece-finished',
      'player-finished',
      'bonus:six',
      'bonus:capture',
      'bonus:finish',
    ]) {
      expect(seen, type).toContain(type);
    }
  });
});

describe('property: arbitrary command streams', () => {
  const actionArb = fc.oneof(
    fc.record({
      type: fc.constant('roll' as const),
      seat: fc.constantFrom(0, 1, 2, 3, 7),
      value: fc.oneof(fc.integer({ min: -2, max: 9 }), fc.double({ noNaN: false })),
    }),
    fc.record({
      type: fc.constant('move' as const),
      seat: fc.constantFrom(0, 1, 2, 3),
      pieceId: fc.constantFrom(
        'yellow-0',
        'yellow-1',
        'green-2',
        'red-3',
        'blue-1',
        'blue-9',
        '',
        'x',
      ),
    }),
    fc.record({ type: fc.constant('leave' as const), seat: fc.constantFrom(0, 1, 2, 3) }),
    // A "smart" action: whatever the current player can legally do.
    fc.record({
      type: fc.constant('legal' as const),
      pick: fc.nat(),
      value: fc.integer({ min: 1, max: 6 }),
    }),
  );

  it('never breaks invariants; rejected commands never change state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PlayerCount>(2, 3, 4),
        fc.array(actionArb, { maxLength: 300 }),
        (count, commands) => {
          let state = createGame({ seats: allocateSeats(count) });
          for (const command of commands) {
            let action: GameAction;
            if (command.type === 'legal') {
              const moves = getCurrentLegalMoves(state);
              action =
                state.turn.phase === 'awaiting-move' && moves.length > 0
                  ? {
                      type: 'move',
                      seat: state.turn.seat,
                      pieceId: moves[command.pick % moves.length]!.pieceId,
                    }
                  : { type: 'roll', seat: state.turn.seat, value: command.value };
            } else {
              action = command as GameAction;
            }
            const before = JSON.stringify(state);
            const result = applyAction(state, action);
            if (!result.ok) {
              if (JSON.stringify(state) !== before) return false;
              continue;
            }
            if (result.state.version !== state.version + 1) return false;
            if (checkInvariants(result.state).length > 0) return false;
            state = result.state;
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});
