import {
  FINISH_TRIANGLES,
  GRID_SIZE,
  HOME_LANE_CELLS,
  LAST_TRACK_PROGRESS,
  SEAT_INDICES,
  SEAT_START_INDEX,
  START_TRACK_INDICES,
  STAR_TRACK_INDICES,
  TRACK_CELLS,
  YARD_RECTS,
  trackDirection,
  trackIndexFor,
  type SeatIndex,
} from '@ludo3d/shared';
import { createCanvas, ctx2d, heightToNormal, type Canvas2D } from '../rendering/textures';

/** Board enamel colours — deep, natural pigments rather than toy primaries. */
export const ENAMEL: Record<SeatIndex, string> = {
  0: '#d29b25', // yellow ochre
  1: '#1d7550', // emerald
  2: '#b0302a', // crimson
  3: '#25569f', // sapphire
};
const IVORY = '#eee3cc';
const NEST = '#f4ecdb';
const GROOVE = '#6e5c47';
const GOLD = '#c39a4b';

/** Physical surface description used for the height and ORM layers. */
interface Surface {
  color: string;
  height: number; // 0..1, 0.6 = flat enamel level
  ao: number;
  rough: number;
  metal: number;
}

const ENAMEL_SURFACE = { height: 0.6, ao: 1, rough: 0.3, metal: 0 };
const IVORY_SURFACE: Surface = { color: IVORY, height: 0.6, ao: 1, rough: 0.38, metal: 0 };
const GROOVE_SURFACE: Surface = { color: GROOVE, height: 0.18, ao: 0.55, rough: 0.8, metal: 0 };
const GOLD_SURFACE: Surface = { color: GOLD, height: 0.72, ao: 1, rough: 0.26, metal: 1 };

export interface BoardFaceMaps {
  color: Canvas2D;
  normal: Canvas2D;
  orm: Canvas2D;
}

type Layer = 'color' | 'height' | 'orm';

function styleFor(surface: Surface, layer: Layer): string {
  if (layer === 'color') return surface.color;
  if (layer === 'height') {
    const v = Math.round(surface.height * 255);
    return `rgb(${v},${v},${v})`;
  }
  return `rgb(${Math.round(surface.ao * 255)},${Math.round(surface.rough * 255)},${Math.round(
    surface.metal * 255,
  )})`;
}

const cache = new Map<number, BoardFaceMaps>();

/** Paints the 15×15 board face. `size` is the texture resolution in pixels. */
export function paintBoardFace(size: number): BoardFaceMaps {
  const cached = cache.get(size);
  if (cached) return cached;

  const c = size / GRID_SIZE;
  const canvases: Record<Layer, Canvas2D> = {
    color: createCanvas(size),
    height: createCanvas(size),
    orm: createCanvas(size),
  };

  for (const layer of ['color', 'height', 'orm'] as const) {
    const ctx = ctx2d(canvases[layer]);
    const fill = (surface: Surface) => {
      ctx.fillStyle = styleFor(surface, layer);
    };
    const stroke = (surface: Surface, width: number) => {
      ctx.strokeStyle = styleFor(surface, layer);
      ctx.lineWidth = width;
    };
    const cellRect = (col: number, row: number) => {
      ctx.fillRect(col * c, row * c, c, c);
    };
    const groove = (col: number, row: number) => {
      stroke(GROOVE_SURFACE, c * 0.035);
      ctx.strokeRect(col * c, row * c, c, c);
    };

    // Base enamel.
    fill(IVORY_SURFACE);
    ctx.fillRect(0, 0, size, size);

    // Yards: coloured enamel with an ivory nest framed by a gold inlay.
    for (const seat of SEAT_INDICES) {
      const r = YARD_RECTS[seat];
      fill({ color: ENAMEL[seat], ...ENAMEL_SURFACE });
      ctx.fillRect(r.minCol * c, r.minRow * c, 6 * c, 6 * c);
      const inset = 0.75 * c;
      const x = r.minCol * c + inset;
      const y = r.minRow * c + inset;
      const s = 6 * c - inset * 2;
      fill({ color: NEST, height: 0.6, ao: 1, rough: 0.4, metal: 0 });
      roundRect(ctx, x, y, s, s, c * 0.45);
      ctx.fill();
      stroke(GOLD_SURFACE, c * 0.06);
      roundRect(ctx, x, y, s, s, c * 0.45);
      ctx.stroke();
      // Engraved outline of the yard itself.
      stroke(GROOVE_SURFACE, c * 0.04);
      ctx.strokeRect(r.minCol * c, r.minRow * c, 6 * c, 6 * c);
    }

    // Shared track squares.
    TRACK_CELLS.forEach((cell, index) => {
      const startSeat = START_TRACK_INDICES.indexOf(index);
      if (startSeat >= 0) {
        fill({ color: ENAMEL[startSeat as SeatIndex], ...ENAMEL_SURFACE });
      } else {
        fill(IVORY_SURFACE);
      }
      cellRect(cell.col, cell.row);
      groove(cell.col, cell.row);
    });

    // Home lanes.
    for (const seat of SEAT_INDICES) {
      for (const cell of HOME_LANE_CELLS[seat]) {
        fill({ color: ENAMEL[seat], ...ENAMEL_SURFACE });
        cellRect(cell.col, cell.row);
        groove(cell.col, cell.row);
      }
    }

    // Centre: four finishing triangles with gold seams.
    for (const seat of SEAT_INDICES) {
      const tri = FINISH_TRIANGLES[seat];
      fill({ color: ENAMEL[seat], ...ENAMEL_SURFACE });
      ctx.beginPath();
      tri.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x * c, p.y * c) : ctx.lineTo(p.x * c, p.y * c),
      );
      ctx.closePath();
      ctx.fill();
      stroke(GOLD_SURFACE, c * 0.05);
      ctx.stroke();
    }

    // Safe stars: inlaid gold.
    for (const index of STAR_TRACK_INDICES) {
      const cell = TRACK_CELLS[index]!;
      fill(GOLD_SURFACE);
      starPath(ctx, (cell.col + 0.5) * c, (cell.row + 0.5) * c, c * 0.33, c * 0.14);
      ctx.fill();
    }

    // Start squares: an engraved arrow along the direction of travel.
    for (const seat of SEAT_INDICES) {
      const index = SEAT_START_INDEX[seat];
      const cell = TRACK_CELLS[index]!;
      const dir = trackDirection(index);
      fill({ color: '#f6eedd', height: 0.45, ao: 0.85, rough: 0.5, metal: 0 });
      arrowPath(ctx, (cell.col + 0.5) * c, (cell.row + 0.5) * c, dir.x, dir.y, c * 0.62);
      ctx.fill();

      // Home-entry square: arrow in the seat colour pointing into the lane.
      const entry = TRACK_CELLS[trackIndexFor(seat, LAST_TRACK_PROGRESS)]!;
      const lane = HOME_LANE_CELLS[seat][0]!;
      fill({ color: ENAMEL[seat], height: 0.48, ao: 0.9, rough: 0.35, metal: 0 });
      arrowPath(
        ctx,
        (entry.col + 0.5) * c,
        (entry.row + 0.5) * c,
        lane.col - entry.col,
        lane.row - entry.row,
        c * 0.55,
      );
      ctx.fill();
    }

    // Gold inlay framing the whole play area.
    stroke(GOLD_SURFACE, c * 0.08);
    ctx.strokeRect(c * 0.04, c * 0.04, size - c * 0.08, size - c * 0.08);
  }

  const maps: BoardFaceMaps = {
    color: canvases.color,
    normal: heightToNormal(canvases.height, 3.2),
    orm: canvases.orm,
  };
  cache.set(size, maps);
  return maps;
}

type Ctx = ReturnType<typeof ctx2d>;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx: Ctx, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Arrow centred on (cx, cy) pointing along (dx, dy), overall length `len`. */
function arrowPath(ctx: Ctx, cx: number, cy: number, dx: number, dy: number, len: number) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const px = -uy;
  const py = ux;
  const half = len / 2;
  const shaft = len * 0.14;
  const head = len * 0.32;
  const neck = half - len * 0.38;
  const pts: [number, number][] = [
    [-half, -shaft],
    [neck, -shaft],
    [neck, -head],
    [half, 0],
    [neck, head],
    [neck, shaft],
    [-half, shaft],
  ];
  ctx.beginPath();
  pts.forEach(([a, b], i) => {
    const x = cx + ux * a + px * b;
    const y = cy + uy * a + py * b;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}
