import { describe, expect, it } from 'vitest';
import {
  SPECIES,
  applyAction,
  checkInvariants,
  getCurrentLegalMoves,
  movesAreEquivalent,
  type GameState,
} from '@ludo3d/shared';
import {
  captureScenario,
  choiceScenario,
  victoryScenario,
  type Scenario,
} from '../src/game/session/scenarios';

/** Applies the scenario's first scripted roll for the human seat. */
function rollFirst(s: Scenario): GameState {
  expect(checkInvariants(s.state)).toEqual([]);
  expect(s.state.turn.seat).toBe(s.human);
  const result = applyAction(s.state, { type: 'roll', seat: s.human, value: s.dice[0]! });
  if (!result.ok) throw new Error(result.message);
  return result.state;
}

describe('E2E scenarios set up exactly the situation they promise', () => {
  it('capture: every attacker/defender pair has a capturing move', () => {
    for (const attacker of SPECIES) {
      for (const defender of SPECIES) {
        const s = captureScenario(attacker, defender);
        if (attacker === defender) {
          expect(s).toBeNull();
          continue;
        }
        const moves = getCurrentLegalMoves(rollFirst(s!));
        expect(
          moves.some((m) => m.captures.length > 0),
          `${attacker}>${defender}`,
        ).toBe(true);
      }
    }
  });

  it('victory: the scripted roll finishes the last animal', () => {
    const moves = getCurrentLegalMoves(rollFirst(victoryScenario()));
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toBe(56);
  });

  it('choice: the scripted roll offers two different moves', () => {
    const moves = getCurrentLegalMoves(rollFirst(choiceScenario()));
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(movesAreEquivalent(moves)).toBe(false);
  });
});
