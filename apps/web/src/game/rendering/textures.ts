import * as THREE from 'three';

export type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createCanvas(width: number, height = width): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function ctx2d(canvas: Canvas2D): Ctx2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

/** Deterministic 2D value noise with fractal Brownian motion. */
export function createNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const values = Float32Array.from({ length: 256 }, () => rand());
  const fade = (t: number) => t * t * (3 - 2 * t);
  const lattice = (x: number, y: number) => values[perm[(perm[x & 255]! + y) & 511]! & 255]!;

  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = fade(x - xi);
    const ty = fade(y - yi);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  const fbm = (x: number, y: number, octaves = 4) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };

  return { noise, fbm };
}

/**
 * Converts a grayscale height canvas (white = high) into a tangent-space
 * normal map using a Sobel filter.
 */
export function heightToNormal(height: Canvas2D, strength = 2): Canvas2D {
  const w = height.width;
  const h = height.height;
  const src = ctx2d(height).getImageData(0, 0, w, h).data;
  const out = createCanvas(w, h);
  const octx = ctx2d(out);
  const img = octx.createImageData(w, h);
  const dst = img.data;
  const at = (x: number, y: number) => {
    const xx = Math.min(w - 1, Math.max(0, x));
    const yy = Math.min(h - 1, Math.max(0, y));
    return src[(yy * w + xx) * 4]! / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      dst[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      dst[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      dst[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      dst[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function canvasTexture(
  canvas: Canvas2D,
  options: { srgb?: boolean; repeat?: number; anisotropy?: number } = {},
): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  texture.colorSpace = options.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = options.anisotropy ?? 4;
  if (options.repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(options.repeat, options.repeat);
  }
  texture.needsUpdate = true;
  return texture;
}

export interface WoodTextures {
  color: Canvas2D;
  height: Canvas2D;
  roughness: Canvas2D;
}

/** Procedural finished hardwood (walnut by default): long grain, pores, figure. */
export function paintWood(
  size: number,
  palette: { dark: string; mid: string; light: string } = {
    dark: '#2b1a10',
    mid: '#4a2e1b',
    light: '#6d4528',
  },
  seed = 7,
): WoodTextures {
  const { fbm, noise } = createNoise(seed);
  const color = createCanvas(size);
  const height = createCanvas(size);
  const rough = createCanvas(size);
  const cctx = ctx2d(color);
  const hctx = ctx2d(height);
  const rctx = ctx2d(rough);
  const cImg = cctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);
  const parse = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [d, m, l] = [parse(palette.dark), parse(palette.mid), parse(palette.light)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Grain runs along x; distort rings with low-frequency noise.
      const warp = fbm(u * 3, v * 12, 3) * 6;
      const rings = Math.sin((v * 46 + warp) * Math.PI);
      const fine = noise(u * 220, v * 900) * 0.35 + noise(u * 60, v * 300) * 0.25;
      const t = Math.min(1, Math.max(0, 0.5 + rings * 0.32 + (fine - 0.3) * 0.6));
      const i = (y * size + x) * 4;
      const a = t < 0.5 ? d : m;
      const b = t < 0.5 ? m : l;
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      cImg.data[i] = a[0]! + (b[0]! - a[0]!) * k;
      cImg.data[i + 1] = a[1]! + (b[1]! - a[1]!) * k;
      cImg.data[i + 2] = a[2]! + (b[2]! - a[2]!) * k;
      cImg.data[i + 3] = 255;
      const pore = noise(u * 500, v * 1600) > 0.82 ? 0.35 : 0;
      const hv = 0.55 + rings * 0.08 - pore;
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = hv * 255;
      hImg.data[i + 3] = 255;
      // Satin lacquer: fairly smooth, slightly rougher in the pores.
      const rv = 0.32 + pore * 0.5 + fine * 0.08;
      rImg.data[i] = 255;
      rImg.data[i + 1] = rv * 255;
      rImg.data[i + 2] = 0;
      rImg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  return { color, height, roughness: rough };
}
