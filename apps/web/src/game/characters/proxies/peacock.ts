import * as THREE from 'three';
import {
  buildRig,
  pulse,
  ramp,
  sampleClip,
  wave,
  type BoneSpec,
  type PartSpec,
  type PoseWriter,
} from '../rig/rigKit';
import { blade, cone, disc, ellipsoid, limb, taperedTube, transformed } from '../rig/shapes';
import { CLIP_DURATIONS as D, createProxyMaterials } from './common';
import type { ProxyBuild } from './types';

const BLUE = new THREE.Color('#1c4fb4');
const BLUE_DEEP = new THREE.Color('#123276');
const WING = '#8b6a45';
const LEG = '#8c8274';
const TRAIN_GREEN = '#3f6f35';
const TRAIN_BRONZE = '#8a7a2e';

const FAN_COUNT = 11;
const FAN_BONES = Array.from({ length: FAN_COUNT }, (_, i) => `fan${i}`);
const TAIL_PIVOT: [number, number, number] = [0, 0.32, -0.11];
const TRAIN_LENGTH = 0.43;
/** The folded train slopes down from the rump to trail along the ground. */
const TRAIN_DROOP = 0.6;

const BONES: BoneSpec[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.31, 0] },
  { name: 'neck1', parent: 'body', at: [0, 0.37, 0.07] },
  { name: 'neck2', parent: 'neck1', at: [0, 0.48, 0.11] },
  { name: 'head', parent: 'neck2', at: [0, 0.6, 0.145] },
  { name: 'crest', parent: 'head', at: [0, 0.645, 0.15] },
  { name: 'wingL', parent: 'body', at: [0.07, 0.35, 0.02] },
  { name: 'wingR', parent: 'body', at: [-0.07, 0.35, 0.02] },
  { name: 'legL1', parent: 'body', at: [0.035, 0.24, 0.0] },
  { name: 'legL2', parent: 'legL1', at: [0.035, 0.125, 0.012] },
  { name: 'footL', parent: 'legL2', at: [0.035, 0.015, 0.02] },
  { name: 'legR1', parent: 'body', at: [-0.035, 0.24, 0.0] },
  { name: 'legR2', parent: 'legR1', at: [-0.035, 0.125, 0.012] },
  { name: 'footR', parent: 'legR2', at: [-0.035, 0.015, 0.02] },
  { name: 'tailBase', parent: 'body', at: TAIL_PIVOT },
  ...FAN_BONES.map((name) => ({ name, parent: 'tailBase', at: TAIL_PIVOT })),
];

/** Rest (folded) yaw spread of each train feather. */
function fanRestYaw(i: number) {
  return (i - (FAN_COUNT - 1) / 2) * 0.045;
}

function parts(): PartSpec[] {
  const plumage = (p: THREE.Vector3) =>
    BLUE.clone().lerp(BLUE_DEEP, Math.min(1, Math.max(0, (0.3 - p.y) * 6)));
  const list: PartSpec[] = [
    {
      bone: 'body',
      geometry: ellipsoid([0, 0.31, 0], [0.072, 0.083, 0.13], 24),
      color: plumage,
      slot: 'plume',
    },
    {
      bone: 'neck1',
      geometry: taperedTube(
        [
          [0, 0.34, 0.06],
          [0, 0.42, 0.09],
          [0, 0.48, 0.11],
        ],
        (t) => 0.036 - t * 0.006,
        10,
        12,
      ),
      color: BLUE,
      slot: 'plume',
    },
    {
      bone: 'neck2',
      geometry: taperedTube(
        [
          [0, 0.48, 0.11],
          [0, 0.55, 0.13],
          [0, 0.61, 0.148],
        ],
        (t) => 0.029 - t * 0.006,
        10,
        12,
      ),
      color: BLUE,
      slot: 'plume',
    },
    {
      bone: 'head',
      geometry: ellipsoid([0, 0.622, 0.156], [0.027, 0.029, 0.036], 16),
      color: BLUE,
      slot: 'plume',
    },
    {
      bone: 'head',
      geometry: cone([0, 0.617, 0.186], [0, 0.609, 0.218], 0.0095, 10),
      color: '#c8b79a',
      slot: 'gloss',
    },
    // Train coverts resting on the rump.
    {
      bone: 'tailBase',
      geometry: ellipsoid([0, 0.33, -0.11], [0.06, 0.035, 0.07], 16),
      color: TRAIN_GREEN,
      slot: 'feather',
    },
  ];
  // Crest: six fine stalks ending in blue fans.
  for (let i = 0; i < 6; i++) {
    const a = (i - 2.5) * 0.11;
    const top: [number, number, number] = [
      Math.sin(a) * 0.03,
      0.705,
      0.148 + Math.cos(a) * 0.004 - 0.01,
    ];
    list.push({
      bone: 'crest',
      geometry: limb([0, 0.645, 0.15], top, 0.0022, 0.0018, 5),
      color: '#2b2b40',
    });
    list.push({
      bone: 'crest',
      geometry: ellipsoid(top, [0.007, 0.011, 0.004], 8),
      color: BLUE,
      slot: 'plume',
    });
  }
  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    list.push({
      bone: 'head',
      geometry: ellipsoid([0.022 * side, 0.628, 0.17], [0.006, 0.009, 0.012], 8),
      color: '#f4efe6',
    });
    list.push({
      bone: 'head',
      geometry: ellipsoid([0.024 * side, 0.629, 0.172], [0.004, 0.005, 0.005], 8),
      color: '#120d0a',
      slot: 'gloss',
    });
    list.push({
      bone: `wing${s}`,
      geometry: ellipsoid([0.068 * side, 0.335, -0.01], [0.024, 0.058, 0.11], 16),
      color: (p) => (Math.sin(p.z * 120) > 0.3 ? '#6b5034' : WING),
    });
    list.push({
      bone: `leg${s}1`,
      geometry: limb([0.035 * side, 0.25, 0], [0.035 * side, 0.125, 0.012], 0.014, 0.008),
      color: plumage,
    });
    list.push({
      bone: `leg${s}2`,
      geometry: limb([0.035 * side, 0.125, 0.012], [0.035 * side, 0.018, 0.02], 0.007, 0.0065),
      color: LEG,
    });
    for (const toe of [-0.5, 0, 0.5]) {
      const tip: [number, number, number] = [
        0.035 * side + Math.sin(toe) * 0.035,
        0.005,
        0.02 + Math.cos(toe) * 0.04,
      ];
      list.push({
        bone: `foot${s}`,
        geometry: limb([0.035 * side, 0.012, 0.02], tip, 0.005, 0.003, 5),
        color: LEG,
      });
    }
  }
  // Train: eleven long feathers, each on its own bone so the fan can open.
  FAN_BONES.forEach((bone, i) => {
    const yaw = fanRestYaw(i);
    const len = TRAIN_LENGTH * (0.86 + 0.14 * Math.cos((i - 5) * 0.28));
    const orient = (g: THREE.BufferGeometry) =>
      transformed(g, { rot: [-TRAIN_DROOP, Math.PI + yaw, 0], at: TAIL_PIVOT });
    list.push({
      bone,
      geometry: orient(blade(len, 0.034)),
      color: (p) => {
        const d = Math.hypot(p.x, p.y - TAIL_PIVOT[1], p.z - TAIL_PIVOT[2]) / len;
        return new THREE.Color(TRAIN_BRONZE).lerp(
          new THREE.Color(TRAIN_GREEN),
          Math.min(1, d * 1.4),
        );
      },
      slot: 'feather',
    });
    // Ocellus ("eye") near the tip: bronze ring, teal band, deep blue centre.
    const eyeAt = len * 0.84;
    for (const [r, color, h] of [
      [0.036, '#9a8a35', 0.0016],
      [0.026, '#1d8a8a', 0.0026],
      [0.014, '#0f2a6e', 0.0036],
    ] as const) {
      const g = disc(r, 18);
      g.translate(0, h, eyeAt);
      list.push({ bone, geometry: orient(g), color, slot: 'feather' });
    }
  });
  return list;
}

const tmpQ = new THREE.Quaternion();
const qRaise = new THREE.Quaternion();
const qSpread = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Opens the train into a display fan. `k` = 0 folded … 1 fully spread; the
 * feathers first lift towards vertical, then spread around the body's axis.
 */
function fan(p: PoseWriter, k: number, shiver = 0) {
  FAN_BONES.forEach((bone, i) => {
    const offset = (i - (FAN_COUNT - 1) / 2) / ((FAN_COUNT - 1) / 2);
    const raise = (Math.PI / 2 + TRAIN_DROOP) * Math.min(1, k * 1.25);
    const spread = offset * 1.35 * Math.max(0, k * 1.25 - 0.25) + shiver * Math.sin(i * 1.7);
    qRaise.setFromAxisAngle(X, raise);
    qSpread.setFromAxisAngle(Z, -spread);
    tmpQ.copy(qSpread).multiply(qRaise);
    p.quat(bone, tmpQ);
  });
}

function walkLegs(p: PoseWriter, t: number, d: number, swing: number) {
  const a = Math.sin((t / d) * Math.PI * 2);
  p.rot('legL1', -a * swing);
  p.rot('legR1', a * swing);
  p.rot('legL2', Math.max(0, a) * swing * 1.2);
  p.rot('legR2', Math.max(0, -a) * swing * 1.2);
  p.move('body', 0, Math.abs(Math.cos((t / d) * Math.PI * 2)) * 0.012, 0);
}

function flap(p: PoseWriter, k: number, t: number, speed = 26) {
  const beat = Math.sin(t * speed) * 0.5 + 0.5;
  p.rot('wingL', 0, 0, (0.4 + 0.9 * beat) * k);
  p.rot('wingR', 0, 0, -(0.4 + 0.9 * beat) * k);
}

export function buildPeacock(): ProxyBuild {
  const rig = buildRig({
    name: 'peacock',
    bones: BONES,
    parts: parts(),
    materials: createProxyMaterials(),
  });
  const clip = (name: string, d: number, fn: Parameters<typeof sampleClip>[3]) =>
    sampleClip(rig, name, d, fn);

  const clips = [
    clip('Idle', D.idle, (t, p) => {
      // Peafowl bob the head forward and back while standing.
      p.rot('neck2', 0.08 * wave(t, D.idle, 3), 0.12 * wave(t, D.idle, 1));
      p.rot('head', -0.06 * wave(t, D.idle, 3, 0.25));
      p.rot('crest', 0.08 * wave(t, D.idle, 4));
      p.rot('tailBase', 0.03 * wave(t, D.idle, 2));
      fan(p, 0.02 + 0.015 * wave(t, D.idle, 1));
    }),
    clip('Anticipation', D.anticipation, (t, p) => {
      p.rot('neck1', -0.15);
      p.rot('head', -0.1 + 0.05 * wave(t, D.anticipation, 3));
      p.rot('crest', 0.15 * wave(t, D.anticipation, 6));
      fan(p, 0.18 + 0.03 * wave(t, D.anticipation, 2));
    }),
    clip('Walk', D.walk, (t, p) => {
      walkLegs(p, t, D.walk, 0.5);
      p.rot('neck1', 0.12 * wave(t, D.walk, 2));
      p.rot('head', -0.1 * wave(t, D.walk, 2, 0.15));
      fan(p, 0.04);
      p.rot('tailBase', 0, 0.05 * wave(t, D.walk, 1));
    }),
    clip('Run', D.run, (t, p) => {
      walkLegs(p, t, D.run, 0.85);
      p.rot('body', 0.15);
      p.rot('neck1', 0.25);
      flap(p, 0.35, t, 18);
      fan(p, 0.02);
    }),
    clip('Entry', D.entry, (t, p) => {
      const crouch = pulse(t, 0, 0.25);
      const air = pulse(t, 0.2, 0.65);
      p.move('body', 0, -0.03 * crouch, 0);
      p.rot('legL1', 0.4 * crouch - 0.6 * air);
      p.rot('legR1', 0.4 * crouch - 0.6 * air);
      p.rot('legL2', 0.9 * air);
      p.rot('legR2', 0.9 * air);
      flap(p, air, t);
      fan(p, 0.1 * air);
    }),
    clip('Land', D.land, (t, p) => {
      const k = pulse(t, 0, D.land);
      p.move('body', 0, -0.025 * k, 0);
      flap(p, 0.4 * k, t);
    }),
    // Attack (vs horse): wings-spread flap-jump finishing with a peck.
    clip('Attack', D.attack, (t, p) => {
      const air = pulse(t, 0.1, 0.65);
      const peck = pulse(t, 0.6, 0.8);
      p.move('body', 0, 0.08 * air, 0);
      flap(p, Math.max(air, 0.2), t, 30);
      p.rot('legL1', -0.7 * air);
      p.rot('legR1', -0.7 * air);
      p.rot('neck1', 0.5 * peck);
      p.rot('neck2', 0.4 * peck);
      fan(p, 0.35 * air);
    }),
    // AttackDisplay (vs lion): the full shimmering train display, strutting in.
    clip('AttackDisplay', D.attack, (t, p) => {
      const open = ramp(t, 0, 0.35) * (1 - ramp(t, 0.85, 1));
      fan(p, open, 0.05 * Math.sin(t * 60) * open);
      p.rot('body', -0.12 * open);
      p.rot('neck1', -0.2 * open);
      p.rot('wingL', 0, 0, 0.35 * open);
      p.rot('wingR', 0, 0, -0.35 * open);
      walkLegs(p, t, 0.5, 0.3 * open);
    }),
    // AttackPeck (vs fox): three rapid neck strikes.
    clip('AttackPeck', D.attack, (t, p) => {
      const pecks = pulse(t, 0.2, 0.36) + pulse(t, 0.42, 0.58) + pulse(t, 0.64, 0.8);
      p.rot('neck1', 0.6 * pecks);
      p.rot('neck2', 0.5 * pecks);
      p.rot('head', 0.2 * pecks);
      p.move('body', 0, 0, 0.02 * pecks);
      flap(p, 0.3, t, 20);
      fan(p, 0.25);
    }),
    // React (vs fox pounce): defensive fan display while stepping back.
    clip('React', D.react, (t, p) => {
      const k = pulse(t, 0, D.react);
      fan(p, 0.85 * k, 0.04 * Math.sin(t * 50) * k);
      p.move('body', 0, 0, -0.04 * k);
      p.rot('neck1', -0.25 * k);
      walkLegs(p, t, 0.4, 0.3 * k);
    }),
    // ReactFlutter (vs lion pounce): an explosive flutter-jump backwards.
    clip('ReactFlutter', D.react, (t, p) => {
      const air = pulse(t, 0, 0.6);
      p.move('body', 0, 0.12 * air, -0.06 * air);
      flap(p, air, t, 34);
      p.rot('legL1', -0.6 * air);
      p.rot('legR1', -0.6 * air);
      p.rot('neck1', -0.3 * air);
      fan(p, 0.5 * air, 0.25 * Math.sin(t * 40) * air);
    }),
    // ReactScatter (vs horse gallop): fan flares, then the bird scurries off.
    clip('ReactScatter', D.react, (t, p) => {
      const flare = pulse(t, 0, 0.4);
      const run = ramp(t, 0.3, 0.5);
      fan(p, 0.7 * flare);
      walkLegs(p, t, 0.28, 0.8 * run);
      flap(p, 0.5 * run, t, 22);
      p.rot('body', 0.2 * run, 0.5 * run);
      p.rot('neck1', 0.3 * run);
    }),
    clip('ReturnHome', D.returnHome, (t, p) => {
      walkLegs(p, t, D.returnHome, 0.8);
      p.rot('body', 0.2);
      p.rot('neck1', 0.35);
      flap(p, 0.3, t, 16);
      fan(p, 0);
    }),
    clip('Victory', D.victory, (t, p) => {
      const open = ramp(t, 0, 0.5);
      fan(p, open, 0.04 * Math.sin(t * 55) * open);
      p.rot('body', -0.1 * open, 0.35 * wave(t, D.victory, 1) * open);
      p.rot('neck1', -0.15);
      p.rot('crest', 0.15 * wave(t, D.victory, 6));
      p.rot('wingL', 0, 0, 0.3 * open);
      p.rot('wingR', 0, 0, -0.3 * open);
    }),
  ];
  return { rig, clips, footprintLength: 0.7 };
}
