import { describe, expect, it } from 'vitest';
import {
  CENTER_RECT,
  FINISH_PROGRESS,
  FINISH_SLOTS,
  GRID_SIZE,
  HOME_LANE_CELLS,
  LAST_TRACK_PROGRESS,
  SEAT_INDICES,
  SEAT_START_INDEX,
  STAR_TRACK_INDICES,
  TRACK_CELLS,
  TRACK_LENGTH,
  YARD_RECTS,
  YARD_SLOTS,
  locate,
  progressForTrackIndex,
  rotateCellCW,
  trackIndexFor,
  type GridCell,
} from '../src';

const key = (c: GridCell) => `${c.col},${c.row}`;
const inRect = (c: GridCell, r: { minCol: number; minRow: number; maxCol: number; maxRow: number }) =>
  c.col >= r.minCol && c.col <= r.maxCol && c.row >= r.minRow && c.row <= r.maxRow;

describe('15×15 board layout', () => {
  it('has exactly 52 distinct shared track squares inside the grid', () => {
    expect(TRACK_CELLS).toHaveLength(TRACK_LENGTH);
    expect(new Set(TRACK_CELLS.map(key)).size).toBe(TRACK_LENGTH);
    for (const c of TRACK_CELLS) {
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(GRID_SIZE);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(GRID_SIZE);
    }
  });

  it('forms a closed loop where every step moves to a neighbouring square', () => {
    for (let i = 0; i < TRACK_LENGTH; i++) {
      const a = TRACK_CELLS[i]!;
      const b = TRACK_CELLS[(i + 1) % TRACK_LENGTH]!;
      const dc = Math.abs(a.col - b.col);
      const dr = Math.abs(a.row - b.row);
      expect(Math.max(dc, dr), `step ${i}`).toBe(1);
    }
  });

  it('never enters a yard or the centre', () => {
    for (const c of TRACK_CELLS) {
      expect(inRect(c, CENTER_RECT)).toBe(false);
      for (const seat of SEAT_INDICES) expect(inRect(c, YARD_RECTS[seat])).toBe(false);
    }
  });

  it('places start squares next to each yard, travelling clockwise', () => {
    expect(TRACK_CELLS[SEAT_START_INDEX[0]]).toEqual({ col: 1, row: 6 });
    expect(TRACK_CELLS[SEAT_START_INDEX[1]]).toEqual({ col: 8, row: 1 });
    expect(TRACK_CELLS[SEAT_START_INDEX[2]]).toEqual({ col: 13, row: 8 });
    expect(TRACK_CELLS[SEAT_START_INDEX[3]]).toEqual({ col: 6, row: 13 });
    // Yellow leaves its yard heading east along row 6, then turns north.
    expect(TRACK_CELLS[1]).toEqual({ col: 2, row: 6 });
    expect(TRACK_CELLS[5]).toEqual({ col: 6, row: 5 });
  });

  it('is rotationally symmetric: each quadrant is the previous rotated 90°', () => {
    for (let i = 0; i < TRACK_LENGTH; i++) {
      expect(TRACK_CELLS[(i + 13) % TRACK_LENGTH]).toEqual(rotateCellCW(TRACK_CELLS[i]!));
    }
  });

  it('has four stars eight squares after each start', () => {
    expect(STAR_TRACK_INDICES).toEqual([8, 21, 34, 47]);
    expect(TRACK_CELLS[8]).toEqual({ col: 6, row: 2 });
  });

  it('gives each seat a five-square home lane that leads from its entry square to the centre', () => {
    for (const seat of SEAT_INDICES) {
      const lane = HOME_LANE_CELLS[seat];
      expect(lane).toHaveLength(5);
      const entry = TRACK_CELLS[trackIndexFor(seat, LAST_TRACK_PROGRESS)]!;
      const first = lane[0]!;
      expect(Math.abs(entry.col - first.col) + Math.abs(entry.row - first.row)).toBe(1);
      for (let i = 1; i < lane.length; i++) {
        const a = lane[i - 1]!;
        const b = lane[i]!;
        expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
      }
      const last = lane[4]!;
      // The final lane square touches the centre 3×3 area.
      const touchesCentre =
        (last.col === CENTER_RECT.minCol - 1 || last.col === CENTER_RECT.maxCol + 1 ||
          last.row === CENTER_RECT.minRow - 1 || last.row === CENTER_RECT.maxRow + 1) &&
        (last.col === 7 || last.row === 7);
      expect(touchesCentre).toBe(true);
      for (const c of lane) expect(TRACK_CELLS.map(key)).not.toContain(key(c));
    }
  });

  it('keeps yard and finish slots inside their regions', () => {
    for (const seat of SEAT_INDICES) {
      const r = YARD_RECTS[seat];
      for (const p of YARD_SLOTS[seat]) {
        expect(p.x).toBeGreaterThan(r.minCol);
        expect(p.x).toBeLessThan(r.maxCol + 1);
        expect(p.y).toBeGreaterThan(r.minRow);
        expect(p.y).toBeLessThan(r.maxRow + 1);
      }
      for (const p of FINISH_SLOTS[seat]) {
        expect(p.x).toBeGreaterThan(6);
        expect(p.x).toBeLessThan(9);
        expect(p.y).toBeGreaterThan(6);
        expect(p.y).toBeLessThan(9);
      }
    }
  });
});

describe('per-seat routes', () => {
  it.each(SEAT_INDICES)('seat %i visits 51 distinct track squares then its lane', (seat) => {
    const visited: string[] = [];
    for (let p = 0; p <= LAST_TRACK_PROGRESS; p++) {
      const loc = locate(seat, p);
      expect(loc.zone).toBe('track');
      if (loc.zone === 'track') visited.push(key(TRACK_CELLS[loc.trackIndex]!));
    }
    expect(new Set(visited).size).toBe(51);
    // The one square never visited is the one directly behind the start.
    const behind = TRACK_CELLS[(SEAT_START_INDEX[seat] + TRACK_LENGTH - 1) % TRACK_LENGTH]!;
    expect(visited).not.toContain(key(behind));
    for (let p = 51; p <= 55; p++) expect(locate(seat, p)).toEqual({ zone: 'lane', laneIndex: p - 51 });
    expect(locate(seat, FINISH_PROGRESS)).toEqual({ zone: 'finished' });
    expect(locate(seat, -1)).toEqual({ zone: 'yard' });
  });

  it('maps global track squares back to relative progress', () => {
    for (const seat of SEAT_INDICES) {
      for (let p = 0; p <= LAST_TRACK_PROGRESS; p++) {
        expect(progressForTrackIndex(seat, trackIndexFor(seat, p))).toBe(p);
      }
      const behind = (SEAT_START_INDEX[seat] + TRACK_LENGTH - 1) % TRACK_LENGTH;
      expect(progressForTrackIndex(seat, behind)).toBeNull();
    }
  });

  it('rejects off-track conversions', () => {
    expect(() => trackIndexFor(0, -1)).toThrow();
    expect(() => trackIndexFor(0, 51)).toThrow();
    expect(() => locate(0, 57)).toThrow();
  });
});
