import * as THREE from 'three';
import {
  buildRig,
  pulse,
  ramp,
  sampleClip,
  wave,
  type BoneSpec,
  type PartSpec,
} from '../rig/rigKit';
import { cone, ellipsoid, ellipsoidRot, limb, shaggy, taperedTube } from '../rig/shapes';
import {
  CLIP_DURATIONS as D,
  breathe,
  createProxyMaterials,
  quadrupedGait,
  tailSway,
  type LegSpec,
} from './common';
import type { ProxyBuild } from './types';

const ORANGE = new THREE.Color('#c85b22');
const ORANGE_DEEP = new THREE.Color('#a8471a');
const WHITE = new THREE.Color('#f2eadf');
const BLACK = new THREE.Color('#271a14');

const BONES: BoneSpec[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.3, -0.02] },
  { name: 'chest', parent: 'body', at: [0, 0.31, 0.13] },
  { name: 'neck', parent: 'chest', at: [0, 0.34, 0.2] },
  { name: 'head', parent: 'neck', at: [0, 0.4, 0.28] },
  { name: 'jaw', parent: 'head', at: [0, 0.372, 0.33] },
  { name: 'earL', parent: 'head', at: [0.042, 0.45, 0.285] },
  { name: 'earR', parent: 'head', at: [-0.042, 0.45, 0.285] },
  { name: 'hips', parent: 'body', at: [0, 0.31, -0.17] },
  { name: 'tail1', parent: 'hips', at: [0, 0.32, -0.25] },
  { name: 'tail2', parent: 'tail1', at: [0.05, 0.24, -0.33] },
  { name: 'tail3', parent: 'tail2', at: [0.12, 0.15, -0.34] },
  { name: 'legFL1', parent: 'chest', at: [0.055, 0.26, 0.14] },
  { name: 'legFL2', parent: 'legFL1', at: [0.055, 0.13, 0.15] },
  { name: 'pawFL', parent: 'legFL2', at: [0.055, 0.025, 0.155] },
  { name: 'legFR1', parent: 'chest', at: [-0.055, 0.26, 0.14] },
  { name: 'legFR2', parent: 'legFR1', at: [-0.055, 0.13, 0.15] },
  { name: 'pawFR', parent: 'legFR2', at: [-0.055, 0.025, 0.155] },
  { name: 'legHL1', parent: 'hips', at: [0.055, 0.28, -0.17] },
  { name: 'legHL2', parent: 'legHL1', at: [0.06, 0.13, -0.23] },
  { name: 'pawHL', parent: 'legHL2', at: [0.06, 0.025, -0.2] },
  { name: 'legHR1', parent: 'hips', at: [-0.055, 0.28, -0.17] },
  { name: 'legHR2', parent: 'legHR1', at: [-0.06, 0.13, -0.23] },
  { name: 'pawHR', parent: 'legHR2', at: [-0.06, 0.025, -0.2] },
];

/** Classic red-fox markings: white throat/chest and muzzle underside, dark socks. */
const coat = (p: THREE.Vector3) => {
  if (p.y < 0.17) return BLACK;
  if (p.z > 0.08 && p.y < 0.33) return WHITE;
  return ORANGE.clone().lerp(ORANGE_DEEP, Math.min(1, Math.max(0, (p.y - 0.3) * 6)));
};
const headCoat = (p: THREE.Vector3) => (p.y < 0.385 && p.z > 0.3 ? WHITE : ORANGE);
const earCoat = (p: THREE.Vector3) => (p.y > 0.505 ? BLACK : ORANGE_DEEP);
const tailCoat = (p: THREE.Vector3) => (p.x > 0.17 ? WHITE : ORANGE);

function parts(): PartSpec[] {
  const list: PartSpec[] = [
    { bone: 'body', geometry: ellipsoid([0, 0.3, -0.02], [0.08, 0.085, 0.2], 26), color: coat },
    { bone: 'chest', geometry: ellipsoid([0, 0.3, 0.11], [0.08, 0.095, 0.095], 20), color: coat },
    {
      bone: 'hips',
      geometry: ellipsoid([0, 0.31, -0.165], [0.077, 0.087, 0.085], 20),
      color: coat,
    },
    {
      bone: 'neck',
      geometry: limb([0, 0.31, 0.16], [0, 0.39, 0.27], 0.055, 0.045, 14),
      color: coat,
    },
    {
      bone: 'head',
      geometry: ellipsoid([0, 0.405, 0.295], [0.066, 0.058, 0.064], 22),
      color: headCoat,
    },
    {
      bone: 'head',
      geometry: limb([0, 0.392, 0.33], [0, 0.375, 0.44], 0.032, 0.012, 14),
      color: headCoat,
    },
    {
      bone: 'head',
      geometry: ellipsoid([0, 0.378, 0.448], [0.011, 0.01, 0.009], 10),
      color: BLACK,
      slot: 'gloss',
    },
    { bone: 'jaw', geometry: ellipsoid([0, 0.363, 0.38], [0.02, 0.011, 0.045], 12), color: WHITE },
    {
      bone: 'earL',
      geometry: cone([0.042, 0.445, 0.285], [0.058, 0.54, 0.272], 0.03, 10),
      color: earCoat,
    },
    {
      bone: 'earR',
      geometry: cone([-0.042, 0.445, 0.285], [-0.058, 0.54, 0.272], 0.03, 10),
      color: earCoat,
    },
    // Brush: a bushy tail built from overlapping fur volumes, white tip.
    // The brush wraps around the flank, as a resting fox's does.
    {
      bone: 'tail1',
      geometry: shaggy([0.01, 0.29, -0.29], [0.045, 0.05, 0.065], 0.12, 12, 16, 3),
      color: tailCoat,
    },
    {
      bone: 'tail2',
      geometry: ellipsoidRot([0.07, 0.21, -0.34], [0.06, 0.065, 0.08], [0.5, 1.0, 0], 18),
      color: tailCoat,
    },
    {
      bone: 'tail3',
      geometry: shaggy([0.15, 0.13, -0.33], [0.075, 0.05, 0.055], 0.14, 12, 18, 8),
      color: tailCoat,
    },
    {
      bone: 'tail1',
      geometry: taperedTube(
        [
          [0, 0.32, -0.25],
          [0.01, 0.29, -0.29],
          [0.05, 0.24, -0.33],
        ],
        () => 0.025,
        6,
        8,
      ),
      color: ORANGE,
    },
  ];
  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    const x = 0.055 * side;
    list.push({
      bone: 'head',
      geometry: ellipsoid([0.034 * side, 0.418, 0.345], [0.011, 0.009, 0.008], 10),
      color: '#7a4a0c',
      slot: 'gloss',
    });
    list.push({
      bone: `legF${s}1`,
      geometry: limb([x, 0.27, 0.14], [x, 0.13, 0.15], 0.03, 0.022),
      color: coat,
    });
    list.push({
      bone: `legF${s}2`,
      geometry: limb([x, 0.13, 0.15], [x, 0.03, 0.155], 0.019, 0.017),
      color: BLACK,
    });
    list.push({
      bone: `pawF${s}`,
      geometry: ellipsoid([x, 0.018, 0.17], [0.022, 0.016, 0.03], 10),
      color: BLACK,
    });
    list.push({
      bone: `legH${s}1`,
      geometry: limb([0.055 * side, 0.3, -0.16], [0.06 * side, 0.13, -0.23], 0.042, 0.022),
      color: coat,
    });
    list.push({
      bone: `legH${s}2`,
      geometry: limb([0.06 * side, 0.13, -0.23], [0.06 * side, 0.03, -0.2], 0.018, 0.017),
      color: BLACK,
    });
    list.push({
      bone: `pawH${s}`,
      geometry: ellipsoid([0.06 * side, 0.018, -0.185], [0.021, 0.015, 0.03], 10),
      color: BLACK,
    });
  }
  return list;
}

const TROT: LegSpec[] = [
  { upper: 'legFL1', lower: 'legFL2', paw: 'pawFL', phase: 0, front: true },
  { upper: 'legHR1', lower: 'legHR2', paw: 'pawHR', phase: 0.02, front: false },
  { upper: 'legFR1', lower: 'legFR2', paw: 'pawFR', phase: 0.5, front: true },
  { upper: 'legHL1', lower: 'legHL2', paw: 'pawHL', phase: 0.52, front: false },
];
const BOUND: LegSpec[] = [
  { upper: 'legFL1', lower: 'legFL2', paw: 'pawFL', phase: 0, front: true },
  { upper: 'legFR1', lower: 'legFR2', paw: 'pawFR', phase: 0.06, front: true },
  { upper: 'legHL1', lower: 'legHL2', paw: 'pawHL', phase: 0.5, front: false },
  { upper: 'legHR1', lower: 'legHR2', paw: 'pawHR', phase: 0.56, front: false },
];
const TAIL = ['tail1', 'tail2', 'tail3'];

export function buildFox(): ProxyBuild {
  const rig = buildRig({
    name: 'fox',
    bones: BONES,
    parts: parts(),
    materials: createProxyMaterials(),
  });
  const clip = (name: string, d: number, fn: Parameters<typeof sampleClip>[3]) =>
    sampleClip(rig, name, d, fn);

  const clips = [
    clip('Idle', D.idle, (t, p) => {
      breathe(p, t, D.idle, 'body', 0.015);
      p.rot(
        'head',
        0.05 * wave(t, D.idle, 1, 0.2),
        0.2 * wave(t, D.idle, 1),
        0.15 * pulse(t, 1.4, 2.4),
      );
      p.rot('earL', 0, 0.4 * pulse(t, 0.6, 0.85), 0);
      p.rot('earR', 0, -0.4 * pulse(t, 2.5, 2.75), 0);
      tailSway(p, t, D.idle, TAIL, 0.2, 1, 0.05);
    }),
    clip('Anticipation', D.anticipation, (t, p) => {
      p.move('body', 0, -0.035, 0);
      p.rot('chest', 0.12);
      p.rot('head', -0.1, 0.05 * wave(t, D.anticipation, 2));
      p.rot('earL', -0.25);
      p.rot('earR', -0.25);
      tailSway(p, t, D.anticipation, TAIL, 0.35, 2, -0.1);
    }),
    clip('Walk', D.walk, (t, p) => {
      quadrupedGait(p, t, D.walk, TROT, { swing: 0.5, lift: 0.9, bob: 0.012, bodyBone: 'body' });
      p.rot('head', 0.04 * wave(t, D.walk, 2));
      tailSway(p, t, D.walk, TAIL, 0.16, 1, 0);
    }),
    clip('Run', D.run, (t, p) => {
      quadrupedGait(p, t, D.run, BOUND, {
        swing: 0.85,
        lift: 1.1,
        bob: 0.035,
        bodyBone: 'body',
        pitch: 0.1,
      });
      p.rot('head', 0.12);
      p.rot('earL', 0.3);
      p.rot('earR', 0.3);
      tailSway(p, t, D.run, TAIL, 0.08, 1, -0.1);
    }),
    clip('Entry', D.entry, (t, p) => {
      const crouch = pulse(t, 0, 0.28);
      const leap = pulse(t, 0.2, 0.62);
      p.move('body', 0, -0.04 * crouch, 0);
      p.rot('body', -0.3 * leap);
      p.rot('legFL1', -0.9 * leap);
      p.rot('legFR1', -0.9 * leap);
      p.rot('legHL1', 0.9 * leap);
      p.rot('legHR1', 0.9 * leap);
      tailSway(p, t, D.entry, TAIL, 0.1, 1, -0.2 * leap);
    }),
    clip('Land', D.land, (t, p) => {
      const k = pulse(t, 0, D.land);
      p.move('body', 0, -0.03 * k, 0);
      p.rot('head', 0.12 * k);
    }),
    // Attack (vs peacock): the fox's signature high, arcing "mouse pounce".
    clip('Attack', D.attack, (t, p) => {
      const crouch = pulse(t, 0, 0.3);
      const rise = pulse(t, 0.25, 0.6);
      const dive = pulse(t, 0.5, 0.85);
      p.move('body', 0, -0.05 * crouch, 0);
      p.rot('body', -0.7 * rise + 1.0 * dive);
      p.rot('legFL1', -1.2 * rise - 0.6 * dive);
      p.rot('legFR1', -1.2 * rise - 0.6 * dive);
      p.rot('legFL2', 1.2 * rise);
      p.rot('legFR2', 1.2 * rise);
      p.rot('legHL1', 0.9 * rise);
      p.rot('legHR1', 0.9 * rise);
      p.rot('head', 0.3 * dive);
      p.rot('earL', -0.3 * rise);
      p.rot('earR', -0.3 * rise);
      tailSway(p, t, D.attack, TAIL, 0.1, 1, 0.5 * rise - 0.3 * dive);
    }),
    // AttackDart (vs lion): quick feints left and right, then a darting snap.
    clip('AttackDart', D.attack, (t, p) => {
      const feint = Math.sin(t * 22) * (1 - ramp(t, 0.45, 0.55));
      const dart = pulse(t, 0.5, 0.8);
      p.move('body', 0.05 * feint, -0.02, 0.06 * dart);
      p.rot('body', 0, 0.3 * feint);
      p.rot('head', -0.1, 0.25 * feint);
      p.rot('jaw', 0.6 * pulse(t, 0.6, 0.78));
      p.rot('earL', -0.4);
      p.rot('earR', -0.4);
      tailSway(p, t, D.attack, TAIL, 0.4, 4, 0.1);
    }),
    // AttackNip (vs horse): low, quick nip at the heels.
    clip('AttackNip', D.attack, (t, p) => {
      const low = ramp(t, 0, 0.3) * (1 - ramp(t, 0.85, 1));
      const nip = pulse(t, 0.45, 0.65) + pulse(t, 0.66, 0.82);
      p.move('body', 0, -0.05 * low, 0.04 * nip);
      p.rot('neck', 0.35 * low - 0.2 * nip);
      p.rot('head', 0.2 * low);
      p.rot('jaw', 0.55 * nip);
      tailSway(p, t, D.attack, TAIL, 0.3, 3, -0.15);
    }),
    // React (vs peacock pecks): yelping hop backwards, ears pinned.
    clip('React', D.react, (t, p) => {
      const hop = pulse(t, 0, 0.5);
      p.move('body', 0, 0.05 * hop, -0.06 * hop);
      p.rot('body', 0.25 * hop);
      p.rot('jaw', 0.4 * pulse(t, 0.05, 0.3));
      p.rot('earL', 0.6 * hop, 0, -0.4 * hop);
      p.rot('earR', 0.6 * hop, 0, 0.4 * hop);
      tailSway(p, t, D.react, TAIL, 0.1, 1, -0.4 * hop);
    }),
    // ReactDodge (vs lion swipe): agile sideways leap.
    clip('ReactDodge', D.react, (t, p) => {
      const leap = pulse(t, 0, 0.55);
      p.move('body', 0.1 * leap, 0.07 * leap, 0);
      p.rot('body', 0, 0.4 * leap, -0.35 * leap);
      p.rot('legFL1', -0.6 * leap);
      p.rot('legFR1', -0.6 * leap);
      p.rot('legHL1', 0.6 * leap);
      p.rot('legHR1', 0.6 * leap);
      tailSway(p, t, D.react, TAIL, 0.2, 1, -0.2);
    }),
    // ReactRoll (vs horse stomp): an evasive tumble to the side.
    clip('ReactRoll', D.react, (t, p) => {
      const k = ramp(t, 0.05, 0.6);
      const up = pulse(t, 0.05, 0.6);
      p.move('body', 0.08 * up, 0.08 * up, -0.03 * up);
      p.rot('body', 0, 0, Math.PI * 2 * k);
      p.rot('legFL1', -0.8 * up);
      p.rot('legFR1', -0.8 * up);
      p.rot('legHL1', 0.8 * up);
      p.rot('legHR1', 0.8 * up);
    }),
    clip('ReturnHome', D.returnHome, (t, p) => {
      quadrupedGait(p, t, D.returnHome, BOUND, {
        swing: 0.8,
        lift: 1.0,
        bob: 0.03,
        bodyBone: 'body',
        pitch: 0.08,
      });
      p.rot('head', 0.25);
      p.rot('earL', 0.5);
      p.rot('earR', 0.5);
      tailSway(p, t, D.returnHome, TAIL, 0.06, 1, -0.25);
    }),
    clip('Victory', D.victory, (t, p) => {
      const hop1 = pulse(t, 0.1, 0.5);
      const hop2 = pulse(t, 0.7, 1.1);
      const bow = pulse(t, 1.3, 2.2);
      p.move('body', 0, 0.06 * (hop1 + hop2) - 0.02 * bow, 0);
      p.rot('body', -0.2 * (hop1 + hop2));
      p.rot('chest', 0.35 * bow);
      p.rot('legFL1', -0.5 * bow);
      p.rot('legFR1', -0.5 * bow);
      p.rot('head', -0.2 * bow, 0, 0.3 * wave(t, D.victory, 2) * bow);
      tailSway(p, t, D.victory, TAIL, 0.45, 3, 0.35);
    }),
  ];
  return { rig, clips, footprintLength: 0.76 };
}
