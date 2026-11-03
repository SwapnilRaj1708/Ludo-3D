import {
  FINISH_PROGRESS,
  FINISH_SLOTS,
  GRID_SIZE,
  HOME_LANE_CELLS,
  LAST_TRACK_PROGRESS,
  SEAT_CORNER,
  TRACK_CELLS,
  YARD_PROGRESS,
  YARD_SLOTS,
  cellCenter,
  trackIndexFor,
  type BoardPoint,
  type PieceIndex,
  type SeatIndex,
} from '@ludo3d/shared';

/**
 * World space: the board is centred on the origin, one grid cell = 1 unit,
 * board coordinate x → world +X and board y (north → south) → world +Z.
 * The play surface sits at y = BOARD_SURFACE_Y.
 */
export const BOARD_SURFACE_Y = 0.004;
export const BOARD_HALF = GRID_SIZE / 2;

export interface WorldXZ {
  x: number;
  z: number;
}

export function boardToWorld(p: BoardPoint): WorldXZ {
  return { x: p.x - BOARD_HALF, z: p.y - BOARD_HALF };
}

/** A key identifying the physical spot a piece occupies (shared by stacked pieces). */
export function spotKey(seat: SeatIndex, progress: number, index: PieceIndex): string {
  if (progress === YARD_PROGRESS) return `yard:${seat}:${index}`;
  if (progress === FINISH_PROGRESS) return `finish:${seat}:${index}`;
  if (progress <= LAST_TRACK_PROGRESS) return `track:${trackIndexFor(seat, progress)}`;
  return `lane:${seat}:${progress}`;
}

/** Centre of the spot (before stacking offsets) in board coordinates. */
export function spotCenter(seat: SeatIndex, progress: number, index: PieceIndex): BoardPoint {
  if (progress === YARD_PROGRESS) return YARD_SLOTS[seat][index]!;
  if (progress === FINISH_PROGRESS) return FINISH_SLOTS[seat][index]!;
  if (progress <= LAST_TRACK_PROGRESS)
    return cellCenter(TRACK_CELLS[trackIndexFor(seat, progress)]!);
  return cellCenter(HOME_LANE_CELLS[seat][progress - LAST_TRACK_PROGRESS - 1]!);
}

export function spotWorld(seat: SeatIndex, progress: number, index: PieceIndex): WorldXZ {
  return boardToWorld(spotCenter(seat, progress, index));
}

/**
 * Offsets (in cell units) and scale for `count` pieces sharing a square, so
 * every animal stays visible and individually tappable.
 */
export function stackLayout(count: number): { offsets: WorldXZ[]; scale: number } {
  switch (count) {
    case 0:
    case 1:
      return { offsets: [{ x: 0, z: 0 }], scale: 1 };
    case 2:
      return {
        offsets: [
          { x: -0.2, z: -0.2 },
          { x: 0.2, z: 0.2 },
        ],
        scale: 0.74,
      };
    case 3:
      return {
        offsets: [
          { x: -0.22, z: -0.18 },
          { x: 0.22, z: -0.18 },
          { x: 0, z: 0.22 },
        ],
        scale: 0.64,
      };
    default:
      return {
        offsets: [
          { x: -0.22, z: -0.22 },
          { x: 0.22, z: -0.22 },
          { x: -0.22, z: 0.22 },
          { x: 0.22, z: 0.22 },
        ],
        scale: 0.58,
      };
  }
}

/** Camera azimuth (radians, from +Z towards +X) that puts a board corner nearest the viewer. */
export function cornerAzimuth(corner: 'nw' | 'ne' | 'se' | 'sw'): number {
  switch (corner) {
    case 'se':
      return Math.PI / 4;
    case 'ne':
      return (3 * Math.PI) / 4;
    case 'nw':
      return (-3 * Math.PI) / 4;
    case 'sw':
      return -Math.PI / 4;
  }
}

export function seatAzimuth(seat: SeatIndex | null): number {
  return cornerAzimuth(seat === null ? 'sw' : SEAT_CORNER[seat]);
}

/** Yaw (rotation about Y) that makes a model whose front faces +Z look along (dx, dz). */
export function yawFromDirection(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
