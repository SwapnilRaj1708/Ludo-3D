import { describe, expect, it } from 'vitest';
import {
  ANIMAL_KINGDOM_THEME,
  SPECIES,
  allEncounterIds,
  chooseBotMove,
  createCryptoDice,
  createGame,
  createScriptedDice,
  createSeededRandom,
  getLegalMoves,
  getRuleProfile,
  parseGameState,
  speciesForSeat,
} from '../src';
import {
  ROOM_CODE_ALPHABET,
  isValidRoomCode,
  joinOptionsSchema,
  moveCommandSchema,
  normalizeRoomCode,
  rollCommandSchema,
  sanitizeDisplayName,
} from '../src/protocol';
import { roll, scenario } from './helpers';

describe('bots', () => {
  it('always choose one of the legal moves', () => {
    const random = createSeededRandom(5);
    const state = scenario({ pieces: { 'yellow-0': 10, 'yellow-1': 30, 'green-0': 2 } });
    const moves = getLegalMoves(state, 0, 3);
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 50; i++) {
        expect(moves).toContainEqual(chooseBotMove(state, moves, { difficulty, random }));
      }
    }
  });

  it('hard bots take an available capture', () => {
    const random = createSeededRandom(9);
    // yellow-1 at 12 can capture green-0 on global 15 with a 3.
    const state = scenario({ pieces: { 'yellow-0': 30, 'yellow-1': 12, 'green-0': 2 } });
    const moves = getLegalMoves(state, 0, 3);
    expect(chooseBotMove(state, moves, { difficulty: 'hard', random }).pieceId).toBe('yellow-1');
  });

  it('hard bots finish a piece when possible', () => {
    const random = createSeededRandom(3);
    const state = scenario({ pieces: { 'yellow-0': 53, 'yellow-1': 20 } });
    const moves = getLegalMoves(state, 0, 3);
    expect(chooseBotMove(state, moves, { difficulty: 'hard', random }).kind).toBe('finish');
  });

  it('refuses to choose from an empty move list', () => {
    expect(() =>
      chooseBotMove(createGame({ seats: [0, 2] }), [], {
        difficulty: 'easy',
        random: createSeededRandom(1),
      }),
    ).toThrow();
  });
});

describe('dice sources', () => {
  it('crypto dice produce every face with roughly equal frequency', () => {
    const dice = createCryptoDice();
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[dice.roll() - 1]!++;
    for (const c of counts) expect(Math.abs(c - n / 6)).toBeLessThan(n * 0.01);
  });

  it('scripted dice replay values and validate them', () => {
    const dice = createScriptedDice([6, 1]);
    expect([dice.roll(), dice.roll()]).toEqual([6, 1]);
    expect(() => dice.roll()).toThrow();
    expect(() => createScriptedDice([7]).roll()).toThrow();
  });

  it('seeded random can be resumed from its state', () => {
    const a = createSeededRandom(77);
    a.next();
    a.next();
    const resumed = createSeededRandom(a.getState());
    expect(resumed.next()).toBe(a.next());
  });
});

describe('serialisation', () => {
  it('round-trips a valid state', () => {
    const state = roll(scenario({ pieces: { 'yellow-0': 10 } }), 4).state;
    expect(parseGameState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('rejects malformed or inconsistent snapshots', () => {
    const state = scenario({ pieces: { 'yellow-0': 10 } });
    expect(parseGameState(null)).toBeNull();
    expect(parseGameState({ ...state, version: -1 })).toBeNull();
    const tampered = {
      ...state,
      pieces: state.pieces.map((p) => (p.id === 'yellow-0' ? { ...p, progress: 99 } : p)),
    };
    expect(parseGameState(tampered)).toBeNull();
    // finishedPieces inconsistent with positions
    const inconsistent = {
      ...state,
      players: state.players.map((p) => (p.seat === 0 ? { ...p, finishedPieces: 2 } : p)),
    };
    expect(parseGameState(inconsistent)).toBeNull();
  });
});

describe('rule profiles and themes', () => {
  it('exposes the default profile by id', () => {
    expect(getRuleProfile('classic-indian-digital')?.blockade.enabled).toBe(true);
    expect(getRuleProfile('nope')).toBeUndefined();
    expect(getRuleProfile('__proto__')).toBeUndefined();
  });

  it('maps colours to the Animal Kingdom species', () => {
    expect(speciesForSeat(ANIMAL_KINGDOM_THEME, 0)).toBe('lion');
    expect(speciesForSeat(ANIMAL_KINGDOM_THEME, 1)).toBe('peacock');
    expect(speciesForSeat(ANIMAL_KINGDOM_THEME, 2)).toBe('horse');
    expect(speciesForSeat(ANIMAL_KINGDOM_THEME, 3)).toBe('fox');
  });

  it('defines twelve distinct directed encounters', () => {
    const ids = allEncounterIds();
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const s of SPECIES) expect(ids).not.toContain(`${s}>${s}`);
  });
});

describe('protocol validation', () => {
  it('normalises and validates room codes', () => {
    expect(normalizeRoomCode(' ab3-k9q ')).toBe('AB3K9Q');
    expect(isValidRoomCode('AB3K9Q')).toBe(true);
    expect(isValidRoomCode('AB3K9')).toBe(false);
    expect(isValidRoomCode('ABCDE0')).toBe(false); // 0 is ambiguous and excluded
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IL01O]/);
  });

  it('sanitises display names without breaking non-Latin scripts', () => {
    expect(sanitizeDisplayName('  Asha \u0000​  Rao  ')).toBe('Asha Rao');
    expect(sanitizeDisplayName('राहुल')).toBe('राहुल');
    expect(sanitizeDisplayName('小明')).toBe('小明');
    expect(Array.from(sanitizeDisplayName('x'.repeat(50)))).toHaveLength(20);
  });

  it('validates commands', () => {
    expect(rollCommandSchema.safeParse({ actionId: 'abcdefgh12', expectedVersion: 3 }).success).toBe(true);
    expect(rollCommandSchema.safeParse({ actionId: 'short', expectedVersion: 3 }).success).toBe(false);
    expect(rollCommandSchema.safeParse({ actionId: 'abcdefgh12', expectedVersion: -1 }).success).toBe(false);
    expect(
      moveCommandSchema.safeParse({ actionId: 'abcdefgh12', expectedVersion: 0, pieceId: 'red-2' }).success,
    ).toBe(true);
    expect(
      moveCommandSchema.safeParse({ actionId: 'abcdefgh12', expectedVersion: 0, pieceId: 'red-4' }).success,
    ).toBe(false);
  });

  it('validates join options with defaults', () => {
    const parsed = joinOptionsSchema.parse({ displayName: '  Meera ' });
    expect(parsed).toEqual({ displayName: 'Meera', mode: 'quick', playerCount: 4 });
    expect(joinOptionsSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ displayName: 'A', playerCount: 5 }).success).toBe(false);
  });
});
