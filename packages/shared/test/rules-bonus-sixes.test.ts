import { describe, expect, it } from 'vitest';
import { CLASSIC_INDIAN_DIGITAL, createGame, type RuleSet } from '../src';
import { eventTypes, move, progressOf, roll, scenario } from './helpers';

const withRules = (patch: Partial<RuleSet>): RuleSet => ({ ...CLASSIC_INDIAN_DIGITAL, ...patch });

describe('bonus rolls', () => {
  it('grants one extra roll after a six', () => {
    const state = scenario({ pieces: { 'yellow-0': 10 } });
    const moved = move(roll(state, 6).state, 'yellow-0');
    expect(moved.events.at(-1)).toMatchObject({ type: 'bonus-roll', reasons: ['six'], granted: 1 });
    expect(moved.state.turn).toMatchObject({ seat: 0, phase: 'awaiting-roll', rollsRemaining: 1 });
  });

  it('grants an extra roll after a capture', () => {
    // green-0 at relative 2 = global 15 (not safe); yellow-0 at 12 rolls 3.
    const state = scenario({ pieces: { 'yellow-0': 12, 'green-0': 2 } });
    const moved = move(roll(state, 3).state, 'yellow-0');
    expect(eventTypes(moved.events)).toEqual(['piece-moved', 'piece-captured', 'bonus-roll']);
    expect(moved.events.at(-1)).toMatchObject({ reasons: ['capture'], granted: 1 });
    expect(moved.state.turn.seat).toBe(0);
  });

  it('grants an extra roll when a piece reaches home', () => {
    const state = scenario({ pieces: { 'yellow-0': 53, 'yellow-1': 10 } });
    const moved = move(roll(state, 3).state, 'yellow-0');
    expect(eventTypes(moved.events)).toEqual(['piece-moved', 'piece-finished', 'bonus-roll']);
    expect(moved.state.turn.seat).toBe(0);
  });

  it('caps bonus rolls at one per move by default (six + capture)', () => {
    // green-0 at relative 5 = global 18; yellow-0 at 12 rolls 6.
    const state = scenario({ pieces: { 'yellow-0': 12, 'green-0': 5 } });
    const moved = move(roll(state, 6).state, 'yellow-0');
    expect(moved.events.at(-1)).toMatchObject({
      type: 'bonus-roll',
      reasons: ['six', 'capture'],
      granted: 1,
    });
    expect(moved.state.turn.rollsRemaining).toBe(1);
  });

  it('stacks bonus rolls when the rule set explicitly allows it', () => {
    const rules = withRules({ bonusRoll: { ...CLASSIC_INDIAN_DIGITAL.bonusRoll, maxPerMove: 3 } });
    const state = scenario({ rules, pieces: { 'yellow-0': 12, 'green-0': 5 } });
    const moved = move(roll(state, 6).state, 'yellow-0');
    expect(moved.events.at(-1)).toMatchObject({ granted: 2 });
    expect(moved.state.turn.rollsRemaining).toBe(2);
  });

  it('still grants the six bonus when the six cannot be used', () => {
    // 53 + 6 overshoots and every other piece is home, so the six is unusable.
    const blocked = scenario({
      pieces: { 'yellow-0': 53, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 56 },
    });
    const rolled = roll(blocked, 6);
    expect(eventTypes(rolled.events)).toEqual(['dice-rolled', 'no-legal-moves', 'bonus-roll']);
    expect(rolled.state.turn).toMatchObject({ seat: 0, phase: 'awaiting-roll' });
  });

  it('passes the turn on an unusable six when onSixWithoutMove is off', () => {
    const rules = withRules({
      bonusRoll: { ...CLASSIC_INDIAN_DIGITAL.bonusRoll, onSixWithoutMove: false },
    });
    const state = scenario({
      rules,
      pieces: { 'yellow-0': 53, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 56 },
    });
    const rolled = roll(state, 6);
    expect(rolled.state.turn.seat).toBe(1);
  });

  it('can disable the six bonus entirely', () => {
    const rules = withRules({ bonusRoll: { ...CLASSIC_INDIAN_DIGITAL.bonusRoll, onSix: false } });
    const state = scenario({ rules, pieces: { 'yellow-0': 10 } });
    const moved = move(roll(state, 6).state, 'yellow-0');
    expect(moved.state.turn.seat).toBe(1);
  });

  it('grants no bonus once the player has brought all four pieces home', () => {
    const state = scenario({
      seats: [0, 1, 2],
      pieces: { 'yellow-0': 56, 'yellow-1': 56, 'yellow-2': 56, 'yellow-3': 50 },
    });
    const moved = move(roll(state, 6).state, 'yellow-3');
    expect(eventTypes(moved.events)).toEqual([
      'piece-moved',
      'piece-finished',
      'player-finished',
      'turn-started',
    ]);
    expect(moved.state.turn.seat).toBe(1);
  });
});

describe('three consecutive sixes', () => {
  it('forfeits the third six, ends the turn and keeps earlier moves', () => {
    let state = createGame({ seats: [0, 1, 2, 3] });
    state = move(roll(state, 6).state, 'yellow-0').state; // enter
    state = move(roll(state, 6).state, 'yellow-0').state; // 0 → 6
    expect(state.turn.consecutiveSixes).toBe(2);
    const third = roll(state, 6);
    expect(eventTypes(third.events)).toEqual(['dice-rolled', 'roll-forfeited', 'turn-started']);
    expect(third.events[1]).toMatchObject({ reason: 'consecutive-sixes', count: 3 });
    expect(third.state.turn).toMatchObject({ seat: 1, consecutiveSixes: 0, rollsRemaining: 1 });
    expect(progressOf(third.state, 'yellow-0')).toBe(6); // completed moves stand
  });

  it('only counts sixes that are consecutive', () => {
    // six, then a capture with a 3 (bonus), then two sixes: no forfeit yet.
    let state = scenario({ pieces: { 'yellow-0': 6, 'green-0': 8 } }); // green-0 at global 21 (star)
    state = move(roll(state, 6).state, 'yellow-0').state; // 6 → 12
    // green-1 at relative 2 = global 15; yellow-0 at 12 rolls 3 → capture.
    state = {
      ...state,
      pieces: state.pieces.map((p) => (p.id === 'green-1' ? { ...p, progress: 2 } : p)),
    };
    state = move(roll(state, 3).state, 'yellow-0').state;
    expect(state.turn.consecutiveSixes).toBe(0);
    state = move(roll(state, 6).state, 'yellow-0').state;
    const second = roll(state, 6);
    expect(second.state.turn.consecutiveSixes).toBe(2);
    expect(eventTypes(second.events)).not.toContain('roll-forfeited');
  });

  it('can be disabled with a limit of zero', () => {
    const rules = withRules({ consecutiveSixes: { limit: 0, policy: 'forfeit-roll' } });
    let state = scenario({ rules, pieces: { 'yellow-0': 0 } });
    for (let i = 0; i < 4; i++) state = move(roll(state, 6).state, 'yellow-0').state;
    expect(progressOf(state, 'yellow-0')).toBe(24);
    expect(state.turn.seat).toBe(0);
  });

  it('resets the counter when the turn passes', () => {
    let state = scenario({ pieces: { 'yellow-0': 0, 'green-0': 30 } });
    state = move(roll(state, 6).state, 'yellow-0').state;
    state = move(roll(state, 2).state, 'yellow-0').state;
    expect(state.turn).toMatchObject({ seat: 1, consecutiveSixes: 0 });
  });
});
