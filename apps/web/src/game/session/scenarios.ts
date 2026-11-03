import {
  ANIMAL_KINGDOM_THEME,
  LAST_TRACK_PROGRESS,
  SEAT_COLOR,
  SEAT_INDICES,
  TRACK_LENGTH,
  createGame,
  isSafeTrackIndex,
  pieceIdOf,
  progressForTrackIndex,
  speciesForSeat,
  type GameState,
  type PieceId,
  type SeatIndex,
  type Species,
} from '@ludo3d/shared';

/**
 * Deterministic positions for automated tests and visual QA (enabled only in
 * E2E builds). Each scenario puts the human (first seat) one roll away from
 * the situation under test and scripts the dice accordingly.
 */
export interface Scenario {
  seats: SeatIndex[];
  human: SeatIndex;
  state: GameState;
  dice: number[];
}

function seatOfSpecies(species: Species): SeatIndex {
  return SEAT_INDICES.find((s) => speciesForSeat(ANIMAL_KINGDOM_THEME, s) === species)!;
}

function withPieces(state: GameState, positions: Partial<Record<PieceId, number>>): GameState {
  const pieces = state.pieces.map((p) =>
    p.id in positions ? { ...p, progress: positions[p.id]! } : p,
  );
  const players = state.players.map((pl) => ({
    ...pl,
    finishedPieces: pieces.filter((p) => p.seat === pl.seat && p.progress === 56).length,
  }));
  return { ...state, pieces, players };
}

/** Attacker one roll of 3 behind a lone defender on an unprotected square. */
export function captureScenario(attacker: Species, defender: Species): Scenario | null {
  const a = seatOfSpecies(attacker);
  const d = seatOfSpecies(defender);
  if (a === d) return null;
  const seats = [a, d].sort((x, y) => x - y) as SeatIndex[];
  const base = createGame({ seats, firstSeat: a });
  for (let g = 0; g < TRACK_LENGTH; g++) {
    const target = (g + 3) % TRACK_LENGTH;
    const pa = progressForTrackIndex(a, g);
    const pd = progressForTrackIndex(d, target);
    if (pa === null || pd === null || pa < 2 || pa + 3 > LAST_TRACK_PROGRESS) continue;
    if (isSafeTrackIndex(base.rules, target) || isSafeTrackIndex(base.rules, g)) continue;
    const state = withPieces(base, { [pieceIdOf(a, 0)]: pa, [pieceIdOf(d, 0)]: pd });
    return { seats, human: a, state, dice: [3] };
  }
  return null;
}

/** Yellow needs a single 1 to bring its last animal home and win (2 players). */
export function victoryScenario(): Scenario {
  const base = createGame({ seats: [0, 2] });
  const state = withPieces(base, {
    'yellow-0': 56,
    'yellow-1': 56,
    'yellow-2': 56,
    'yellow-3': 55,
    'red-0': 20,
    'red-1': 3,
  });
  return { seats: [0, 2], human: 0, state, dice: [1] };
}

export function scenarioName(s: Scenario): string {
  return s.seats.map((seat) => SEAT_COLOR[seat]).join('-');
}
