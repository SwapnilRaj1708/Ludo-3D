import {
  buildRig,
  pulse,
  ramp,
  sampleClip,
  wave,
  type BoneSpec,
  type PartSpec,
} from '../rig/rigKit';
import { ellipsoid, limb, shaggy, taperedTube } from '../rig/shapes';
import {
  CLIP_DURATIONS as D,
  breathe,
  createProxyMaterials,
  gradientY,
  quadrupedGait,
  tailSway,
  type LegSpec,
} from './common';
import type { ProxyBuild } from './types';

const TAWNY = '#c08440';
const BELLY = '#d8b07a';
const MANE_DARK = '#4a2710';
const MANE_LIGHT = '#8a5426';
const MUZZLE = '#ecd5b0';
const DARK = '#2a1a12';

const BONES: BoneSpec[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.46, -0.04] },
  { name: 'chest', parent: 'body', at: [0, 0.48, 0.16] },
  { name: 'neck', parent: 'chest', at: [0, 0.54, 0.27] },
  { name: 'mane', parent: 'neck', at: [0, 0.57, 0.3] },
  { name: 'head', parent: 'neck', at: [0, 0.6, 0.38] },
  { name: 'jaw', parent: 'head', at: [0, 0.565, 0.44] },
  { name: 'earL', parent: 'head', at: [0.075, 0.69, 0.37] },
  { name: 'earR', parent: 'head', at: [-0.075, 0.69, 0.37] },
  { name: 'hips', parent: 'body', at: [0, 0.47, -0.25] },
  { name: 'tail1', parent: 'hips', at: [0, 0.5, -0.36] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.4, -0.43] },
  { name: 'tail3', parent: 'tail2', at: [0, 0.28, -0.46] },
  { name: 'legFL1', parent: 'chest', at: [0.085, 0.4, 0.18] },
  { name: 'legFL2', parent: 'legFL1', at: [0.085, 0.21, 0.19] },
  { name: 'pawFL', parent: 'legFL2', at: [0.085, 0.045, 0.2] },
  { name: 'legFR1', parent: 'chest', at: [-0.085, 0.4, 0.18] },
  { name: 'legFR2', parent: 'legFR1', at: [-0.085, 0.21, 0.19] },
  { name: 'pawFR', parent: 'legFR2', at: [-0.085, 0.045, 0.2] },
  { name: 'legHL1', parent: 'hips', at: [0.08, 0.42, -0.25] },
  { name: 'legHL2', parent: 'legHL1', at: [0.085, 0.2, -0.31] },
  { name: 'pawHL', parent: 'legHL2', at: [0.085, 0.045, -0.27] },
  { name: 'legHR1', parent: 'hips', at: [-0.08, 0.42, -0.25] },
  { name: 'legHR2', parent: 'legHR1', at: [-0.085, 0.2, -0.31] },
  { name: 'pawHR', parent: 'legHR2', at: [-0.085, 0.045, -0.27] },
];

function parts(): PartSpec[] {
  const coat = gradientY(BELLY, TAWNY, 0.36, 0.5);
  const list: PartSpec[] = [
    { bone: 'body', geometry: ellipsoid([0, 0.46, -0.04], [0.125, 0.13, 0.28], 28), color: coat },
    { bone: 'chest', geometry: ellipsoid([0, 0.46, 0.14], [0.135, 0.15, 0.15], 24), color: coat },
    { bone: 'hips', geometry: ellipsoid([0, 0.465, -0.24], [0.12, 0.13, 0.13], 22), color: coat },
    {
      bone: 'mane',
      geometry: shaggy([0, 0.58, 0.3], [0.19, 0.21, 0.16], 0.13, 10, 30, 3),
      color: gradientY(MANE_DARK, MANE_LIGHT, 0.42, 0.78),
    },
    {
      bone: 'mane',
      geometry: shaggy([0, 0.5, 0.27], [0.13, 0.12, 0.12], 0.12, 12, 20, 5),
      color: MANE_DARK,
    },
    { bone: 'head', geometry: ellipsoid([0, 0.61, 0.42], [0.092, 0.098, 0.105], 24), color: TAWNY },
    { bone: 'head', geometry: ellipsoid([0, 0.585, 0.5], [0.058, 0.045, 0.06], 18), color: MUZZLE },
    {
      bone: 'head',
      geometry: ellipsoid([0, 0.598, 0.555], [0.026, 0.018, 0.014], 12),
      color: DARK,
      slot: 'gloss',
    },
    { bone: 'head', geometry: ellipsoid([0, 0.665, 0.455], [0.07, 0.025, 0.05], 14), color: TAWNY },
    {
      bone: 'jaw',
      geometry: ellipsoid([0, 0.548, 0.485], [0.046, 0.022, 0.05], 14),
      color: MUZZLE,
    },
    {
      bone: 'earL',
      geometry: ellipsoid([0.075, 0.7, 0.37], [0.026, 0.03, 0.012], 12),
      color: TAWNY,
    },
    {
      bone: 'earR',
      geometry: ellipsoid([-0.075, 0.7, 0.37], [0.026, 0.03, 0.012], 12),
      color: TAWNY,
    },
    // Tail segments with a dark tuft.
    // The tail hangs from the rump so the lion stays within its square.
    {
      bone: 'tail1',
      geometry: taperedTube(
        [
          [0, 0.5, -0.36],
          [0, 0.45, -0.41],
          [0, 0.4, -0.43],
        ],
        () => 0.018,
        8,
        8,
      ),
      color: TAWNY,
    },
    {
      bone: 'tail2',
      geometry: taperedTube(
        [
          [0, 0.4, -0.43],
          [0, 0.34, -0.45],
          [0, 0.28, -0.46],
        ],
        () => 0.016,
        8,
        8,
      ),
      color: TAWNY,
    },
    {
      bone: 'tail3',
      geometry: taperedTube(
        [
          [0, 0.28, -0.46],
          [0, 0.23, -0.465],
          [0, 0.18, -0.47],
        ],
        () => 0.014,
        6,
        8,
      ),
      color: TAWNY,
    },
    {
      bone: 'tail3',
      geometry: shaggy([0, 0.16, -0.475], [0.03, 0.045, 0.03], 0.18, 14, 14, 9),
      color: DARK,
    },
  ];
  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    const eye: [number, number, number] = [0.042 * side, 0.638, 0.49];
    list.push({
      bone: 'head',
      geometry: ellipsoid(eye, [0.015, 0.012, 0.01], 10),
      color: '#5b3d12',
      slot: 'gloss',
    });
    // Front leg: upper, lower, paw.
    list.push({
      bone: `legF${s}1`,
      geometry: limb([0.085 * side, 0.43, 0.18], [0.085 * side, 0.21, 0.19], 0.052, 0.04),
      color: TAWNY,
    });
    list.push({
      bone: `legF${s}2`,
      geometry: limb([0.085 * side, 0.21, 0.19], [0.085 * side, 0.05, 0.2], 0.038, 0.034),
      color: TAWNY,
    });
    list.push({
      bone: `pawF${s}`,
      geometry: ellipsoid([0.085 * side, 0.03, 0.225], [0.04, 0.028, 0.052], 14),
      color: BELLY,
    });
    // Hind leg: thigh, shank, paw.
    list.push({
      bone: `legH${s}1`,
      geometry: limb([0.08 * side, 0.45, -0.24], [0.085 * side, 0.2, -0.31], 0.066, 0.038),
      color: TAWNY,
    });
    list.push({
      bone: `legH${s}2`,
      geometry: limb([0.085 * side, 0.2, -0.31], [0.085 * side, 0.05, -0.27], 0.034, 0.032),
      color: TAWNY,
    });
    list.push({
      bone: `pawH${s}`,
      geometry: ellipsoid([0.085 * side, 0.03, -0.25], [0.038, 0.027, 0.05], 14),
      color: BELLY,
    });
  }
  return list;
}

const LEGS: LegSpec[] = [
  { upper: 'legHL1', lower: 'legHL2', paw: 'pawHL', phase: 0, front: false },
  { upper: 'legFL1', lower: 'legFL2', paw: 'pawFL', phase: 0.25, front: true },
  { upper: 'legHR1', lower: 'legHR2', paw: 'pawHR', phase: 0.5, front: false },
  { upper: 'legFR1', lower: 'legFR2', paw: 'pawFR', phase: 0.75, front: true },
];
const BOUND: LegSpec[] = [
  { upper: 'legFL1', lower: 'legFL2', paw: 'pawFL', phase: 0, front: true },
  { upper: 'legFR1', lower: 'legFR2', paw: 'pawFR', phase: 0.08, front: true },
  { upper: 'legHL1', lower: 'legHL2', paw: 'pawHL', phase: 0.5, front: false },
  { upper: 'legHR1', lower: 'legHR2', paw: 'pawHR', phase: 0.58, front: false },
];
const TAIL = ['tail1', 'tail2', 'tail3'];

export function buildLion(): ProxyBuild {
  const rig = buildRig({
    name: 'lion',
    bones: BONES,
    parts: parts(),
    materials: createProxyMaterials(),
  });
  const clip = (name: string, d: number, fn: Parameters<typeof sampleClip>[3]) =>
    sampleClip(rig, name, d, fn);

  const clips = [
    clip('Idle', D.idle, (t, p) => {
      breathe(p, t, D.idle, 'body');
      p.rot('head', 0.04 * wave(t, D.idle, 1, 0.2), 0.16 * wave(t, D.idle, 1), 0);
      p.rot('mane', 0, 0, 0.025 * wave(t, D.idle, 2));
      tailSway(p, t, D.idle, TAIL, 0.22, 1, 0.1);
      p.rot('earL', 0, 0, 0.5 * pulse(t, 2.1, 2.3));
    }),
    clip('Anticipation', D.anticipation, (t, p) => {
      p.move('body', 0, -0.03, 0);
      p.rot('chest', 0.06);
      p.rot('head', -0.18 + 0.03 * wave(t, D.anticipation, 2), 0.06 * wave(t, D.anticipation));
      p.rot('legFL1', -0.1);
      p.rot('legFR1', -0.1);
      tailSway(p, t, D.anticipation, TAIL, 0.35, 2, 0.35);
    }),
    clip('Walk', D.walk, (t, p) => {
      quadrupedGait(p, t, D.walk, LEGS, { swing: 0.42, lift: 0.7, bob: 0.014, bodyBone: 'body' });
      p.rot('head', 0.05 * wave(t, D.walk, 2), 0.04 * wave(t, D.walk));
      p.rot('mane', 0, 0, 0.03 * wave(t, D.walk, 2));
      tailSway(p, t, D.walk, TAIL, 0.2, 1, 0.05);
    }),
    clip('Run', D.run, (t, p) => {
      quadrupedGait(p, t, D.run, BOUND, {
        swing: 0.75,
        lift: 1.0,
        bob: 0.04,
        bodyBone: 'body',
        pitch: 0.09,
      });
      p.rot('head', 0.1 + 0.08 * wave(t, D.run), 0);
      tailSway(p, t, D.run, TAIL, 0.12, 1, -0.25);
    }),
    clip('Entry', D.entry, (t, p) => {
      const crouch = pulse(t, 0, 0.3);
      const leap = pulse(t, 0.22, 0.62);
      p.move('body', 0, -0.06 * crouch + 0.03 * leap, 0);
      p.rot('chest', -0.25 * leap);
      p.rot('legFL1', -0.9 * leap);
      p.rot('legFR1', -0.9 * leap);
      p.rot('legFL2', 0.6 * leap);
      p.rot('legFR2', 0.6 * leap);
      p.rot('legHL1', 0.7 * leap);
      p.rot('legHR1', 0.7 * leap);
      tailSway(p, t, D.entry, TAIL, 0.1, 1, -0.3 * leap);
    }),
    clip('Land', D.land, (t, p) => {
      const k = pulse(t, 0, D.land);
      p.move('body', 0, -0.05 * k, 0);
      p.rot('head', 0.15 * k);
      p.rot('legFL2', 0.3 * k);
      p.rot('legFR2', 0.3 * k);
    }),
    // Attack variant 1 — high pounce with forepaws raised (vs birds).
    clip('Attack', D.attack, (t, p) => {
      const crouch = pulse(t, 0, 0.32);
      const leap = pulse(t, 0.26, 0.72);
      const strike = pulse(t, 0.55, 0.85);
      p.move('body', 0, -0.07 * crouch + 0.06 * leap, 0);
      p.rot('body', -0.4 * leap + 0.15 * strike);
      p.rot('legFL1', -1.4 * leap + 0.4 * strike);
      p.rot('legFR1', -1.3 * leap + 0.4 * strike);
      p.rot('legFL2', 0.9 * leap);
      p.rot('legFR2', 0.9 * leap);
      p.rot('legHL1', 0.6 * leap);
      p.rot('legHR1', 0.6 * leap);
      p.rot('jaw', 0.45 * pulse(t, 0.3, 0.9));
      p.rot('head', -0.25 * leap + 0.2 * strike);
      tailSway(p, t, D.attack, TAIL, 0.35, 3, 0.2);
    }),
    // Attack variant 2 — roar then a driving charge (vs horse).
    clip('AttackRoar', D.attack, (t, p) => {
      const roar = pulse(t, 0, 0.5);
      const charge = pulse(t, 0.45, 0.95);
      p.rot('head', -0.35 * roar + 0.15 * charge, 0.1 * wave(t, 0.2) * roar);
      p.rot('jaw', 0.7 * roar + 0.3 * charge);
      p.rot('mane', 0.1 * roar, 0, 0.08 * wave(t, 0.12) * roar);
      p.move('body', 0, -0.03 * charge, 0.04 * charge);
      p.rot('legFL1', -0.7 * charge);
      p.rot('legFR1', -0.5 * charge);
      p.rot('legHL1', 0.5 * charge);
      p.rot('legHR1', 0.6 * charge);
      tailSway(p, t, D.attack, TAIL, 0.4, 3, 0.4 * roar);
    }),
    // Attack variant 3 — low stalk and a sweeping paw swipe (vs fox).
    clip('AttackSwipe', D.attack, (t, p) => {
      const stalk = ramp(t, 0, 0.35) * (1 - ramp(t, 0.8, 1));
      const swipe = pulse(t, 0.45, 0.75);
      p.move('body', 0, -0.08 * stalk, 0);
      p.rot('head', 0.2 * stalk - 0.1 * swipe);
      p.rot('legFR1', -1.1 * swipe, 0, -0.5 * swipe);
      p.rot('legFR2', 0.5 * swipe);
      p.rot('chest', 0, 0, 0.12 * swipe);
      p.rot('jaw', 0.35 * swipe);
      tailSway(p, t, D.attack, TAIL, 0.5, 2, -0.1);
    }),
    // Reaction variant (vs fox): a dismissive swat and recoil with a head shake.
    clip('React', D.react, (t, p) => {
      const recoil = pulse(t, 0, 0.5);
      p.move('body', 0, -0.02 * recoil, -0.05 * recoil);
      p.rot('head', 0.1 * recoil, 0.35 * Math.sin(t * 28) * pulse(t, 0.1, 0.6));
      p.rot('legFL1', -0.8 * pulse(t, 0.3, 0.7), 0, 0.3 * pulse(t, 0.3, 0.7));
      p.rot('jaw', 0.4 * recoil);
      p.rot('earL', 0, 0, -0.5 * recoil);
      p.rot('earR', 0, 0, 0.5 * recoil);
    }),
    // Reaction variant (vs peacock): startled — rears back onto haunches.
    clip('ReactStartle', D.react, (t, p) => {
      const back = pulse(t, 0, D.react);
      p.rot('body', -0.35 * back);
      p.move('body', 0, -0.03 * back, -0.06 * back);
      p.rot('legFL1', -0.6 * back);
      p.rot('legFR1', -0.6 * back);
      p.rot('head', -0.2 * back, 0.2 * back);
      p.rot('earL', 0, 0, -0.6 * back);
      p.rot('earR', 0, 0, 0.6 * back);
    }),
    // Reaction variant (vs horse): crouched retreat with a snarl.
    clip('ReactRetreat', D.react, (t, p) => {
      const k = pulse(t, 0, D.react);
      p.move('body', 0, -0.07 * k, -0.08 * k);
      p.rot('head', 0.2 * k);
      p.rot('jaw', 0.5 * k);
      p.rot('legHL1', 0.4 * k);
      p.rot('legHR1', 0.4 * k);
      tailSway(p, t, D.react, TAIL, 0.2, 2, -0.4 * k);
    }),
    clip('ReturnHome', D.returnHome, (t, p) => {
      quadrupedGait(p, t, D.returnHome, BOUND, {
        swing: 0.7,
        lift: 0.9,
        bob: 0.035,
        bodyBone: 'body',
        pitch: 0.07,
      });
      p.rot('head', 0.28);
      tailSway(p, t, D.returnHome, TAIL, 0.1, 1, -0.35);
    }),
    clip('Victory', D.victory, (t, p) => {
      const roar = pulse(t, 0.2, 1.3);
      p.rot('head', -0.55 * roar + 0.03 * wave(t, D.victory, 2));
      p.rot('jaw', 0.75 * roar);
      p.rot('mane', 0, 0, 0.1 * Math.sin(t * 22) * roar);
      p.rot('chest', -0.08 * roar);
      breathe(p, t, D.victory, 'body', 0.02);
      tailSway(p, t, D.victory, TAIL, 0.3, 2, 0.3);
    }),
  ];
  return { rig, clips, footprintLength: 0.94 };
}
