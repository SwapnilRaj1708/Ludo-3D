import type { PieceIndex, PlayerColor, SeatIndex } from '../constants/seats';
import type { BonusReason, DiceValue, RuleSet } from '../rules/types';

/** Stable, human-readable piece identifier, e.g. `yellow-0`. */
export type PieceId = `${PlayerColor}-${PieceIndex}`;

export interface PieceState {
  readonly id: PieceId;
  readonly seat: SeatIndex;
  readonly index: PieceIndex;
  /** See board/topology.ts: -1 yard, 0…50 track, 51…55 lane, 56 finished. */
  readonly progress: number;
}

export type PlayerStatus = 'active' | 'finished' | 'left';

export interface PlayerState {
  readonly seat: SeatIndex;
  readonly color: PlayerColor;
  readonly status: PlayerStatus;
  readonly finishedPieces: number;
  readonly captures: number;
  /** 1-based final placing; set when the player finishes or the match ends. */
  readonly rank: number | null;
}

export type TurnPhase = 'awaiting-roll' | 'awaiting-move' | 'game-over';

export interface TurnState {
  readonly seat: SeatIndex;
  readonly phase: TurnPhase;
  /** The roll waiting to be used (set only while awaiting a move). */
  readonly dice: DiceValue | null;
  /** Rolls the current seat may still take this turn. */
  readonly rollsRemaining: number;
  /** Sixes rolled in a row within this turn. */
  readonly consecutiveSixes: number;
  readonly rollsTaken: number;
  /** Increments every time the turn passes to another seat. */
  readonly number: number;
}

export type GameStatus = 'playing' | 'finished';

export interface GameState {
  readonly formatVersion: 1;
  readonly rules: RuleSet;
  /** Seats taking part, in clockwise (turn) order. */
  readonly seats: readonly SeatIndex[];
  /** One entry per seat in `seats`, same order. */
  readonly players: readonly PlayerState[];
  /** Four pieces per seat, ordered by seat then piece index. */
  readonly pieces: readonly PieceState[];
  readonly turn: TurnState;
  readonly status: GameStatus;
  /** Finishing order; complete once `status === 'finished'`. */
  readonly rankings: readonly SeatIndex[];
  readonly winner: SeatIndex | null;
  /** Seats that left, in the order they left. */
  readonly leftOrder: readonly SeatIndex[];
  /** Number of successfully applied actions. Used for sync and idempotency. */
  readonly version: number;
}

export type MoveKind = 'enter' | 'advance' | 'finish';

export interface Move {
  readonly seat: SeatIndex;
  readonly pieceId: PieceId;
  readonly kind: MoveKind;
  readonly from: number;
  readonly to: number;
  /** Progress values visited in order, excluding `from` and including `to`. */
  readonly path: readonly number[];
  /** Opponent pieces sent back to their yards by this move. */
  readonly captures: readonly PieceId[];
}

/**
 * Actions are the only way to change a GameState. Values arrive from untrusted
 * sources (network, storage), so they are typed loosely and validated by the
 * reducer. Dice values are supplied by the caller — the engine never generates
 * randomness — which keeps it deterministic and lets the server own the RNG.
 */
export type GameAction =
  | { readonly type: 'roll'; readonly seat: SeatIndex; readonly value: number }
  | { readonly type: 'move'; readonly seat: SeatIndex; readonly pieceId: string }
  | { readonly type: 'leave'; readonly seat: SeatIndex };

export type GameEvent =
  | {
      readonly type: 'dice-rolled';
      readonly seat: SeatIndex;
      readonly value: DiceValue;
      readonly consecutiveSixes: number;
    }
  | {
      readonly type: 'roll-forfeited';
      readonly seat: SeatIndex;
      readonly reason: 'consecutive-sixes';
      readonly count: number;
    }
  | { readonly type: 'no-legal-moves'; readonly seat: SeatIndex; readonly value: DiceValue }
  | {
      readonly type: 'piece-moved';
      readonly seat: SeatIndex;
      readonly pieceId: PieceId;
      readonly kind: MoveKind;
      readonly from: number;
      readonly to: number;
      readonly path: readonly number[];
    }
  | {
      readonly type: 'piece-captured';
      readonly seat: SeatIndex;
      readonly pieceId: PieceId;
      readonly victimSeat: SeatIndex;
      readonly victimId: PieceId;
      readonly victimFrom: number;
      readonly trackIndex: number;
    }
  | {
      readonly type: 'piece-finished';
      readonly seat: SeatIndex;
      readonly pieceId: PieceId;
      readonly finishedPieces: number;
    }
  | {
      readonly type: 'bonus-roll';
      readonly seat: SeatIndex;
      readonly reasons: readonly BonusReason[];
      readonly granted: number;
    }
  | { readonly type: 'turn-started'; readonly seat: SeatIndex; readonly turnNumber: number }
  | { readonly type: 'player-finished'; readonly seat: SeatIndex; readonly rank: number }
  | { readonly type: 'player-left'; readonly seat: SeatIndex }
  | {
      readonly type: 'game-over';
      readonly rankings: readonly SeatIndex[];
      readonly winner: SeatIndex | null;
    };

export type GameEventType = GameEvent['type'];

export type EngineErrorCode =
  | 'game-over'
  | 'unknown-seat'
  | 'player-not-active'
  | 'not-your-turn'
  | 'wrong-phase'
  | 'invalid-dice'
  | 'unknown-piece'
  | 'not-your-piece'
  | 'illegal-move'
  | 'invalid-action';

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: EngineErrorCode; readonly message: string };
