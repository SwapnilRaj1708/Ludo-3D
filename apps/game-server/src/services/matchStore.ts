import type { SeatIndex } from '@ludo3d/shared';
import { logger } from './logger.js';

export interface MatchSummary {
  matchId: string;
  roomCode: string;
  mode: string;
  ruleProfileId: string;
  startedAt: number;
  endedAt: number;
  players: {
    seat: SeatIndex;
    name: string;
    /** Only for registered/anonymous Firebase users; guests are not persisted. */
    uid: string | null;
    rank: number;
    finishedPieces: number;
    captures: number;
    left: boolean;
  }[];
  winnerSeat: SeatIndex | null;
  actions: number;
}

export interface MatchStore {
  readonly kind: string;
  save(summary: MatchSummary): Promise<void>;
}

/** Used when no database is configured: the summary is logged, not stored. */
export class LogOnlyMatchStore implements MatchStore {
  readonly kind = 'log-only';
  async save(summary: MatchSummary) {
    logger.info(
      { matchId: summary.matchId, winner: summary.winnerSeat, players: summary.players.length },
      'match finished',
    );
  }
}

/** In-memory store for tests. */
export class MemoryMatchStore implements MatchStore {
  readonly kind = 'memory';
  readonly saved: MatchSummary[] = [];
  async save(summary: MatchSummary) {
    this.saved.push(summary);
  }
}

let current: MatchStore = new LogOnlyMatchStore();

export function matchStore(): MatchStore {
  return current;
}

export function setMatchStore(store: MatchStore) {
  current = store;
}
