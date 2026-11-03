import type { SeatIndex } from '../constants/seats';

/**
 * Logical topology of the classic Ludo board.
 *
 * Every piece has a single integer `progress` that fully describes where it is
 * relative to its own seat:
 *
 *   -1          in the starting yard
 *    0          on its own start square (shared track)
 *    1 … 50     further along the shared 52-square track
 *   51 … 55     inside its own five-square home lane
 *   56          finished (the home triangle in the centre)
 *
 * The home stretch is therefore six steps long: five coloured lane squares
 * plus the finishing triangle (see docs/GAME_RULES.md §2 and DECISIONS.md).
 * A piece never visits the shared square directly behind its own start
 * square — it turns into its lane from relative square 50.
 */
export const TRACK_LENGTH = 52;
export const HOME_LANE_LENGTH = 5;

export const YARD_PROGRESS = -1;
export const START_PROGRESS = 0;
export const LAST_TRACK_PROGRESS = TRACK_LENGTH - 2; // 50
export const FIRST_LANE_PROGRESS = LAST_TRACK_PROGRESS + 1; // 51
export const LAST_LANE_PROGRESS = LAST_TRACK_PROGRESS + HOME_LANE_LENGTH; // 55
export const FINISH_PROGRESS = LAST_LANE_PROGRESS + 1; // 56

/** Global track index (0…51) of each seat's start square. */
export const SEAT_START_INDEX: Readonly<Record<SeatIndex, number>> = {
  0: 0,
  1: 13,
  2: 26,
  3: 39,
};

/** Star (safe) squares sit this many steps after each start square. */
export const STAR_OFFSET = 8;

export const START_TRACK_INDICES: readonly number[] = [0, 13, 26, 39];
export const STAR_TRACK_INDICES: readonly number[] = START_TRACK_INDICES.map(
  (i) => (i + STAR_OFFSET) % TRACK_LENGTH,
);

export type PieceLocation =
  | { readonly zone: 'yard' }
  | { readonly zone: 'track'; readonly trackIndex: number }
  | { readonly zone: 'lane'; readonly laneIndex: number }
  | { readonly zone: 'finished' };

export function isValidProgress(progress: number): boolean {
  return Number.isInteger(progress) && progress >= YARD_PROGRESS && progress <= FINISH_PROGRESS;
}

export function isInYard(progress: number): boolean {
  return progress === YARD_PROGRESS;
}

export function isOnTrack(progress: number): boolean {
  return progress >= START_PROGRESS && progress <= LAST_TRACK_PROGRESS;
}

export function isInLane(progress: number): boolean {
  return progress >= FIRST_LANE_PROGRESS && progress <= LAST_LANE_PROGRESS;
}

export function isFinished(progress: number): boolean {
  return progress === FINISH_PROGRESS;
}

/** Global track index for a piece of `seat` at track progress 0…50. */
export function trackIndexFor(seat: SeatIndex, progress: number): number {
  if (!isOnTrack(progress)) {
    throw new RangeError(`progress ${progress} is not on the shared track`);
  }
  return (SEAT_START_INDEX[seat] + progress) % TRACK_LENGTH;
}

export function locate(seat: SeatIndex, progress: number): PieceLocation {
  if (isInYard(progress)) return { zone: 'yard' };
  if (isOnTrack(progress)) return { zone: 'track', trackIndex: trackIndexFor(seat, progress) };
  if (isInLane(progress)) return { zone: 'lane', laneIndex: progress - FIRST_LANE_PROGRESS };
  if (isFinished(progress)) return { zone: 'finished' };
  throw new RangeError(`invalid progress ${progress}`);
}

/**
 * Relative progress a piece of `seat` would have when standing on global
 * track square `trackIndex`, or null if that square is behind its start
 * (index 51 relative), which the seat never visits.
 */
export function progressForTrackIndex(seat: SeatIndex, trackIndex: number): number | null {
  const rel = (trackIndex - SEAT_START_INDEX[seat] + TRACK_LENGTH) % TRACK_LENGTH;
  return rel <= LAST_TRACK_PROGRESS ? rel : null;
}
