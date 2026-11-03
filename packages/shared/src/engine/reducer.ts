import { isSeatIndex, type SeatIndex } from '../constants/seats';
import {
  FINISH_PROGRESS,
  YARD_PROGRESS,
  isOnTrack,
  trackIndexFor,
} from '../board/topology';
import { isDiceValue, type BonusReason, type DiceValue } from '../rules/types';
import { evaluatePieceMove, getLegalMoves } from './moves';
import type {
  ApplyResult,
  EngineErrorCode,
  GameAction,
  GameEvent,
  GameState,
  PieceState,
  PlayerState,
  TurnState,
} from './types';

function fail(error: EngineErrorCode, message: string): ApplyResult {
  return { ok: false, error, message };
}

function playerOf(state: GameState, seat: SeatIndex): PlayerState | undefined {
  return state.players.find((p) => p.seat === seat);
}

function replacePlayer(
  players: readonly PlayerState[],
  seat: SeatIndex,
  update: Partial<PlayerState>,
): PlayerState[] {
  return players.map((p) => (p.seat === seat ? { ...p, ...update } : p));
}

/** Next seat clockwise after `from` whose player is still active. */
export function nextActiveSeat(state: GameState, from: SeatIndex): SeatIndex | null {
  const order = state.seats;
  const start = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const seat = order[(start + k) % order.length]!;
    if (playerOf(state, seat)?.status === 'active') return seat;
  }
  return null;
}

function totalProgress(state: GameState, seat: SeatIndex): number {
  return state.pieces
    .filter((p) => p.seat === seat)
    .reduce((sum, p) => sum + (p.progress === YARD_PROGRESS ? 0 : p.progress + 1), 0);
}

/**
 * Completes the ranking when a match ends: players who finished keep their
 * finishing order; remaining active players follow by pieces finished, then
 * total progress, then seat order; players who left come last (the most
 * recent leaver ranks highest among them).
 */
function finalRankings(state: GameState): SeatIndex[] {
  const finished = [...state.rankings];
  const active = state.players
    .filter((p) => p.status === 'active')
    .sort(
      (a, b) =>
        b.finishedPieces - a.finishedPieces ||
        totalProgress(state, b.seat) - totalProgress(state, a.seat) ||
        state.seats.indexOf(a.seat) - state.seats.indexOf(b.seat),
    )
    .map((p) => p.seat);
  const left = [...state.leftOrder].reverse();
  return [...finished, ...active, ...left];
}

function isMatchOver(state: GameState): boolean {
  const active = state.players.filter((p) => p.status === 'active').length;
  const finished = state.players.filter((p) => p.status === 'finished').length;
  if (active <= 1) return true;
  return state.rules.endCondition === 'first-winner' && finished >= 1;
}

function endMatch(state: GameState, events: GameEvent[]): GameState {
  const rankings = finalRankings(state);
  const players = state.players.map((p) => ({
    ...p,
    rank: rankings.indexOf(p.seat) + 1,
  }));
  const winnerSeat = rankings.find((seat) => playerOf(state, seat)?.status !== 'left') ?? null;
  events.push({ type: 'game-over', rankings, winner: winnerSeat });
  return {
    ...state,
    players,
    rankings,
    winner: winnerSeat,
    status: 'finished',
    turn: { ...state.turn, phase: 'game-over', dice: null, rollsRemaining: 0 },
  };
}

function startTurn(state: GameState, seat: SeatIndex, events: GameEvent[]): GameState {
  const turn: TurnState = {
    seat,
    phase: 'awaiting-roll',
    dice: null,
    rollsRemaining: 1,
    consecutiveSixes: 0,
    rollsTaken: 0,
    number: state.turn.number + 1,
  };
  events.push({ type: 'turn-started', seat, turnNumber: turn.number });
  return { ...state, turn };
}

/** Ends the current seat's turn and hands it to the next active seat. */
function passTurn(state: GameState, events: GameEvent[]): GameState {
  if (isMatchOver(state)) return endMatch(state, events);
  const next = nextActiveSeat(state, state.turn.seat);
  if (next === null) return endMatch(state, events);
  return startTurn(state, next, events);
}

/** After a roll or move: keep rolling if rolls remain, otherwise pass. */
function continueOrPass(state: GameState, events: GameEvent[]): GameState {
  if (isMatchOver(state)) return endMatch(state, events);
  const player = playerOf(state, state.turn.seat);
  if (player?.status === 'active' && state.turn.rollsRemaining > 0) {
    return { ...state, turn: { ...state.turn, phase: 'awaiting-roll', dice: null } };
  }
  return passTurn(state, events);
}

function applyRoll(state: GameState, seat: SeatIndex, rawValue: number): ApplyResult {
  if (state.turn.phase !== 'awaiting-roll') {
    return fail('wrong-phase', 'A roll is not expected right now');
  }
  if (!isDiceValue(rawValue)) return fail('invalid-dice', 'Dice value must be an integer 1-6');
  const value: DiceValue = rawValue;
  const { rules } = state;
  const events: GameEvent[] = [];

  const consecutiveSixes = value === 6 ? state.turn.consecutiveSixes + 1 : 0;
  let next: GameState = {
    ...state,
    turn: {
      ...state.turn,
      dice: null,
      rollsRemaining: state.turn.rollsRemaining - 1,
      rollsTaken: state.turn.rollsTaken + 1,
      consecutiveSixes,
    },
  };
  events.push({ type: 'dice-rolled', seat, value, consecutiveSixes });

  const limit = rules.consecutiveSixes.limit;
  if (value === 6 && limit > 0 && consecutiveSixes >= limit) {
    events.push({
      type: 'roll-forfeited',
      seat,
      reason: 'consecutive-sixes',
      count: consecutiveSixes,
    });
    // The forfeiting roll ends the turn outright; completed moves stand.
    next = { ...next, turn: { ...next.turn, rollsRemaining: 0 } };
    return { ok: true, state: passTurn(next, events), events };
  }

  const moves = getLegalMoves(next, seat, value);
  if (moves.length === 0) {
    events.push({ type: 'no-legal-moves', seat, value });
    if (value === 6 && rules.bonusRoll.onSix && rules.bonusRoll.onSixWithoutMove) {
      next = { ...next, turn: { ...next.turn, rollsRemaining: next.turn.rollsRemaining + 1 } };
      events.push({ type: 'bonus-roll', seat, reasons: ['six'], granted: 1 });
    }
    return { ok: true, state: continueOrPass(next, events), events };
  }

  next = { ...next, turn: { ...next.turn, phase: 'awaiting-move', dice: value } };
  return { ok: true, state: next, events };
}

function applyMove(state: GameState, seat: SeatIndex, pieceId: string): ApplyResult {
  if (state.turn.phase !== 'awaiting-move' || state.turn.dice === null) {
    return fail('wrong-phase', 'A move is not expected right now');
  }
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return fail('unknown-piece', `No piece with id ${pieceId}`);
  if (piece.seat !== seat) return fail('not-your-piece', 'That piece belongs to another player');

  const dice = state.turn.dice;
  const move = evaluatePieceMove(state, piece, dice);
  if (!move) return fail('illegal-move', `${pieceId} cannot move ${dice}`);

  const { rules } = state;
  const events: GameEvent[] = [];
  const captured = new Set<string>(move.captures);

  let capturedTrackIndex = -1;
  if (move.captures.length > 0) capturedTrackIndex = trackIndexFor(seat, move.to);

  const victims: PieceState[] = [];
  const pieces = state.pieces.map((p) => {
    if (p.id === piece.id) return { ...p, progress: move.to };
    if (captured.has(p.id)) {
      victims.push(p);
      return { ...p, progress: YARD_PROGRESS };
    }
    return p;
  });

  events.push({
    type: 'piece-moved',
    seat,
    pieceId: piece.id,
    kind: move.kind,
    from: move.from,
    to: move.to,
    path: move.path,
  });

  for (const victim of victims) {
    events.push({
      type: 'piece-captured',
      seat,
      pieceId: piece.id,
      victimSeat: victim.seat,
      victimId: victim.id,
      victimFrom: victim.progress,
      trackIndex: capturedTrackIndex,
    });
  }

  const mover = playerOf(state, seat)!;
  let players = replacePlayer(state.players, seat, {
    captures: mover.captures + victims.length,
  });
  let rankings = state.rankings;

  const reachedHome = move.to === FINISH_PROGRESS;
  let playerCompleted = false;
  if (reachedHome) {
    const finishedPieces = mover.finishedPieces + 1;
    players = replacePlayer(players, seat, { finishedPieces });
    events.push({ type: 'piece-finished', seat, pieceId: piece.id, finishedPieces });
    if (finishedPieces === 4) {
      playerCompleted = true;
      const rank = rankings.length + 1;
      rankings = [...rankings, seat];
      players = replacePlayer(players, seat, { status: 'finished', rank });
      events.push({ type: 'player-finished', seat, rank });
    }
  }

  const reasons: BonusReason[] = [];
  if (dice === 6 && rules.bonusRoll.onSix) reasons.push('six');
  if (victims.length > 0 && rules.bonusRoll.onCapture) reasons.push('capture');
  if (reachedHome && rules.bonusRoll.onFinish) reasons.push('finish');
  const granted = playerCompleted ? 0 : Math.min(reasons.length, rules.bonusRoll.maxPerMove);

  let next: GameState = {
    ...state,
    pieces,
    players,
    rankings,
    turn: {
      ...state.turn,
      dice: null,
      rollsRemaining: state.turn.rollsRemaining + granted,
    },
  };
  if (granted > 0) events.push({ type: 'bonus-roll', seat, reasons, granted });

  next = continueOrPass(next, events);
  return { ok: true, state: next, events };
}

function applyLeave(state: GameState, seat: SeatIndex): ApplyResult {
  const player = playerOf(state, seat)!;
  if (player.status === 'left') return fail('player-not-active', 'Player already left');
  const events: GameEvent[] = [];
  if (player.status === 'finished') {
    // A finished player's placing is already secured; leaving changes nothing.
    return { ok: true, state, events };
  }

  let next: GameState = {
    ...state,
    players: replacePlayer(state.players, seat, { status: 'left' }),
    pieces: state.pieces.map((p) =>
      p.seat === seat && p.progress !== FINISH_PROGRESS ? { ...p, progress: YARD_PROGRESS } : p,
    ),
    leftOrder: [...state.leftOrder, seat],
  };
  events.push({ type: 'player-left', seat });

  if (isMatchOver(next)) {
    next = endMatch(next, events);
  } else if (state.turn.seat === seat) {
    next = passTurn(next, events);
  }
  return { ok: true, state: next, events };
}

/**
 * The single entry point for changing game state. Pure: returns a new state
 * and the ordered list of events describing what happened, or an error.
 */
export function applyAction(state: GameState, action: GameAction): ApplyResult {
  if (state.status !== 'playing') return fail('game-over', 'The match has ended');
  if (!action || typeof action !== 'object') return fail('invalid-action', 'Malformed action');
  if (!isSeatIndex(action.seat) || !state.seats.includes(action.seat)) {
    return fail('unknown-seat', 'Seat is not part of this match');
  }

  let result: ApplyResult;
  if (action.type === 'leave') {
    result = applyLeave(state, action.seat);
  } else {
    const player = playerOf(state, action.seat);
    if (player?.status !== 'active') {
      return fail('player-not-active', 'Player is no longer taking turns');
    }
    if (state.turn.seat !== action.seat) return fail('not-your-turn', 'It is not your turn');
    switch (action.type) {
      case 'roll':
        result = applyRoll(state, action.seat, action.value);
        break;
      case 'move':
        if (typeof action.pieceId !== 'string') {
          return fail('invalid-action', 'pieceId must be a string');
        }
        result = applyMove(state, action.seat, action.pieceId);
        break;
      default:
        return fail('invalid-action', 'Unknown action type');
    }
  }

  if (!result.ok) return result;
  return { ...result, state: { ...result.state, version: state.version + 1 } };
}

/** Convenience for internal checks: is this piece on the shared track? */
export function pieceTrackIndex(piece: PieceState): number | null {
  return isOnTrack(piece.progress) ? trackIndexFor(piece.seat, piece.progress) : null;
}
