import type { SeatIndex } from '../constants/seats';
import { chooseBotMove, type BotDifficulty } from '../ai/bot';
import type { DiceSource, RandomSource } from '../random/dice';
import { getCurrentLegalMoves } from './moves';
import { applyAction } from './reducer';
import type { ApplyResult, GameAction, GameEvent, GameState } from './types';

export interface AutoActionOptions {
  readonly dice: DiceSource;
  readonly random: RandomSource;
  readonly difficulty: BotDifficulty;
}

/**
 * Chooses the next action for whoever's turn it is, as a bot would: roll when
 * a roll is expected, otherwise pick a legal move. Used for bot seats, for
 * server-side turn timeouts, and for simulations.
 */
export function nextAutoAction(state: GameState, options: AutoActionOptions): GameAction | null {
  if (state.status !== 'playing') return null;
  const seat = state.turn.seat;
  if (state.turn.phase === 'awaiting-roll') {
    return { type: 'roll', seat, value: options.dice.roll() };
  }
  if (state.turn.phase === 'awaiting-move') {
    const moves = getCurrentLegalMoves(state);
    const move = chooseBotMove(state, moves, {
      difficulty: options.difficulty,
      random: options.random,
    });
    return { type: 'move', seat, pieceId: move.pieceId };
  }
  return null;
}

export interface SimulationResult {
  readonly state: GameState;
  readonly events: GameEvent[];
  readonly actions: number;
}

/**
 * Plays a match to completion with bots in every seat. Throws if an action
 * is rejected (which would indicate an engine bug) or the safety limit hits.
 */
export function simulateMatch(
  initial: GameState,
  options: {
    readonly dice: DiceSource;
    readonly random: RandomSource;
    readonly difficultyFor?: (seat: SeatIndex) => BotDifficulty;
    readonly maxActions?: number;
    readonly onStep?: (result: Extract<ApplyResult, { ok: true }>, action: GameAction) => void;
  },
): SimulationResult {
  const maxActions = options.maxActions ?? 20_000;
  let state = initial;
  const events: GameEvent[] = [];
  let actions = 0;
  while (state.status === 'playing') {
    if (actions >= maxActions) throw new Error(`Match did not finish within ${maxActions} actions`);
    const action = nextAutoAction(state, {
      dice: options.dice,
      random: options.random,
      difficulty: options.difficultyFor?.(state.turn.seat) ?? 'medium',
    });
    if (!action) break;
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`Auto action rejected: ${result.error} ${result.message}`);
    options.onStep?.(result, action);
    state = result.state;
    events.push(...result.events);
    actions++;
  }
  return { state, events, actions };
}
