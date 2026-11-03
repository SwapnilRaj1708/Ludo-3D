import * as THREE from 'three';
import type { AnimState } from '../animStates';
import { TAU, deg, type PoseWriter } from '../rig/rigKit';

/**
 * Proxy materials: physically based, vertex-coloured so one material covers a
 * whole body. Sheen approximates the soft rim highlight of fur; it is a stand-in
 * until groomed, textured final assets are supplied.
 */
export function createProxyMaterials() {
  const fur = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
    sheen: 0.9,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#fff1d6'),
  });
  fur.name = 'proxy_fur';
  const gloss = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  gloss.name = 'proxy_gloss';
  const plume = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.36,
    metalness: 0.15,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessMinimum: 180,
    iridescenceThicknessMaximum: 620,
    sheen: 0.4,
    sheenColor: new THREE.Color('#9fd6ff'),
  });
  plume.name = 'proxy_plume';
  const feather = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.1,
    iridescence: 0.85,
    iridescenceIOR: 1.3,
    iridescenceThicknessMinimum: 220,
    iridescenceThicknessMaximum: 700,
    side: THREE.DoubleSide,
  });
  feather.name = 'proxy_feather';
  return { fur, gloss, plume, feather };
}

/** Vertical colour gradient helper: below `y0` → a, above `y1` → b. */
export function gradientY(a: string, b: string, y0: number, y1: number) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return (p: THREE.Vector3) => {
    const k = Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0)));
    return ca.clone().lerp(cb, k);
  };
}

export interface LegSpec {
  upper: string;
  lower: string;
  paw?: string;
  /** Gait phase offset in cycles (0..1). */
  phase: number;
  front: boolean;
}

export interface GaitParams {
  swing: number;
  lift: number;
  bob: number;
  bodyBone: string;
  pitch?: number;
}

/**
 * Generic quadruped leg cycle. Each leg swings forward during the first half
 * of its cycle (foot lifted, joint flexed) and pushes back during the second.
 */
export function quadrupedGait(
  p: PoseWriter,
  t: number,
  duration: number,
  legs: readonly LegSpec[],
  params: GaitParams,
) {
  for (const leg of legs) {
    const phase = (((t / duration + leg.phase) % 1) + 1) % 1;
    const angle = TAU * phase;
    // Negative X swings the leg forward (+Z).
    p.rot(leg.upper, -Math.sin(angle) * params.swing);
    const lifting = Math.max(0, Math.sin(angle));
    p.rot(leg.lower, lifting * params.lift * (leg.front ? 1 : 0.8));
    if (leg.paw) p.rot(leg.paw, -lifting * params.lift * 0.5);
  }
  const bob = Math.abs(Math.sin(TAU * (t / duration) * 2)) * params.bob;
  p.move(params.bodyBone, 0, bob - params.bob * 0.5, 0);
  if (params.pitch) p.rot(params.bodyBone, Math.sin(TAU * (t / duration)) * params.pitch);
}

/** Tail chain sway (yaw) with a travelling phase delay down the chain. */
export function tailSway(
  p: PoseWriter,
  t: number,
  duration: number,
  bones: readonly string[],
  amplitude: number,
  cycles = 1,
  lift = 0,
) {
  bones.forEach((bone, i) => {
    const ph = TAU * ((t / duration) * cycles - i * 0.12);
    p.rot(bone, i === 0 ? lift : 0, Math.sin(ph) * amplitude * (1 + i * 0.35), 0);
  });
}

export function breathe(p: PoseWriter, t: number, duration: number, bone: string, amount = 0.012) {
  const s = 1 + Math.sin(TAU * (t / duration) * 2) * amount;
  p.scale(bone, [s, s, 1 + (s - 1) * 0.4]);
}

/** Durations (seconds) shared by every species' clip set. */
export const CLIP_DURATIONS: Record<AnimState, number> = {
  idle: 3.2,
  anticipation: 1.2,
  walk: 0.9,
  run: 0.5,
  entry: 0.7,
  land: 0.35,
  attack: 1.0,
  react: 0.85,
  returnHome: 0.55,
  victory: 2.4,
};

export { deg, TAU };
