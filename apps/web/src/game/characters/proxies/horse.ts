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
import { cone, ellipsoid, limb, shaggy, taperedTube } from '../rig/shapes';
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

const COAT_TOP = '#7a3b1b';
const COAT_LOW = '#5e2a13';
const MANE = '#1b1410';
const HOOF = '#2c2723';
const BLAZE = '#f1e9dd';
const MUZZLE = '#3e2418';

const BONES: BoneSpec[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.62, -0.02] },
  { name: 'chest', parent: 'body', at: [0, 0.64, 0.22] },
  { name: 'neck1', parent: 'chest', at: [0, 0.73, 0.29] },
  { name: 'neck2', parent: 'neck1', at: [0, 0.86, 0.36] },
  { name: 'head', parent: 'neck2', at: [0, 1.0, 0.43] },
  { name: 'earL', parent: 'head', at: [0.03, 1.06, 0.43] },
  { name: 'earR', parent: 'head', at: [-0.03, 1.06, 0.43] },
  { name: 'hips', parent: 'body', at: [0, 0.65, -0.24] },
  { name: 'tail1', parent: 'hips', at: [0, 0.71, -0.36] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.52, -0.45] },
  { name: 'legFL1', parent: 'chest', at: [0.075, 0.56, 0.24] },
  { name: 'legFL2', parent: 'legFL1', at: [0.075, 0.3, 0.25] },
  { name: 'hoofFL', parent: 'legFL2', at: [0.075, 0.08, 0.25] },
  { name: 'legFR1', parent: 'chest', at: [-0.075, 0.56, 0.24] },
  { name: 'legFR2', parent: 'legFR1', at: [-0.075, 0.3, 0.25] },
  { name: 'hoofFR', parent: 'legFR2', at: [-0.075, 0.08, 0.25] },
  { name: 'legHL1', parent: 'hips', at: [0.075, 0.58, -0.26] },
  { name: 'legHL2', parent: 'legHL1', at: [0.075, 0.3, -0.33] },
  { name: 'hoofHL', parent: 'legHL2', at: [0.075, 0.08, -0.29] },
  { name: 'legHR1', parent: 'hips', at: [-0.075, 0.58, -0.26] },
  { name: 'legHR2', parent: 'legHR1', at: [-0.075, 0.3, -0.33] },
  { name: 'hoofHR', parent: 'legHR2', at: [-0.075, 0.08, -0.29] },
];

function parts(): PartSpec[] {
  const coat = gradientY(COAT_LOW, COAT_TOP, 0.5, 0.75);
  const list: PartSpec[] = [
    { bone: 'body', geometry: ellipsoid([0, 0.62, -0.02], [0.125, 0.145, 0.33], 30), color: coat },
    { bone: 'chest', geometry: ellipsoid([0, 0.63, 0.2], [0.12, 0.15, 0.14], 24), color: coat },
    { bone: 'hips', geometry: ellipsoid([0, 0.655, -0.24], [0.128, 0.15, 0.14], 24), color: coat },
    {
      bone: 'neck1',
      geometry: taperedTube(
        [
          [0, 0.68, 0.25],
          [0, 0.76, 0.3],
          [0, 0.86, 0.36],
        ],
        (t) => 0.085 - t * 0.02,
        10,
        14,
      ),
      color: COAT_TOP,
    },
    {
      bone: 'neck2',
      geometry: taperedTube(
        [
          [0, 0.86, 0.36],
          [0, 0.93, 0.4],
          [0, 1.0, 0.43],
        ],
        (t) => 0.064 - t * 0.012,
        10,
        14,
      ),
      color: COAT_TOP,
    },
    // Long head angled down, with a white blaze and soft dark muzzle.
    {
      bone: 'head',
      geometry: limb([0, 1.01, 0.43], [0, 0.9, 0.6], 0.052, 0.04, 16),
      color: COAT_TOP,
    },
    {
      bone: 'head',
      geometry: ellipsoid([0, 0.885, 0.6], [0.041, 0.038, 0.046], 16),
      color: MUZZLE,
    },
    {
      bone: 'head',
      geometry: limb([0, 1.035, 0.463], [0, 0.925, 0.61], 0.013, 0.011, 8),
      color: BLAZE,
    },
    {
      bone: 'head',
      geometry: ellipsoid([0.018, 0.884, 0.643], [0.008, 0.01, 0.006], 8),
      color: '#120c08',
      slot: 'gloss',
    },
    {
      bone: 'head',
      geometry: ellipsoid([-0.018, 0.884, 0.643], [0.008, 0.01, 0.006], 8),
      color: '#120c08',
      slot: 'gloss',
    },
    {
      bone: 'earL',
      geometry: cone([0.03, 1.045, 0.43], [0.036, 1.12, 0.41], 0.017),
      color: COAT_TOP,
    },
    {
      bone: 'earR',
      geometry: cone([-0.03, 1.045, 0.43], [-0.036, 1.12, 0.41], 0.017),
      color: COAT_TOP,
    },
    // Tail: dense hair volumes on two bones.
    {
      bone: 'tail1',
      geometry: taperedTube(
        [
          [0, 0.71, -0.36],
          [0, 0.64, -0.42],
          [0, 0.52, -0.45],
        ],
        () => 0.03,
        8,
        10,
      ),
      color: MANE,
    },
    {
      bone: 'tail2',
      geometry: shaggy([0, 0.36, -0.48], [0.045, 0.17, 0.04], 0.16, 11, 20, 4),
      color: MANE,
    },
  ];
  // Mane: a ridge of hair tufts along the crest of the neck plus a forelock.
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    const at: [number, number, number] = [0, 1.02 - k * 0.24, 0.41 - k * 0.15];
    list.push({
      bone: k < 0.45 ? 'neck2' : 'neck1',
      geometry: shaggy(at, [0.022, 0.06, 0.04], 0.2, 12, 12, i + 2),
      color: MANE,
    });
  }
  list.push({
    bone: 'head',
    geometry: shaggy([0, 1.05, 0.47], [0.02, 0.035, 0.03], 0.2, 12, 10, 11),
    color: MANE,
  });

  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    const x = 0.075 * side;
    list.push({
      bone: 'head',
      geometry: ellipsoid([0.045 * side, 0.99, 0.48], [0.012, 0.014, 0.01], 10),
      color: '#140d09',
      slot: 'gloss',
    });
    list.push({
      bone: `legF${s}1`,
      geometry: limb([x, 0.58, 0.24], [x, 0.3, 0.25], 0.046, 0.031),
      color: coat,
    });
    list.push({
      bone: `legF${s}2`,
      geometry: limb([x, 0.3, 0.25], [x, 0.085, 0.25], 0.027, 0.024),
      color: COAT_LOW,
    });
    list.push({
      bone: `hoofF${s}`,
      geometry: limb([x, 0.075, 0.252], [x, 0.012, 0.262], 0.029, 0.034, 12),
      color: HOOF,
      slot: 'gloss',
    });
    list.push({
      bone: `legH${s}1`,
      geometry: limb([x, 0.62, -0.25], [x, 0.3, -0.33], 0.064, 0.034),
      color: coat,
    });
    list.push({
      bone: `legH${s}2`,
      geometry: limb([x, 0.3, -0.33], [x, 0.085, -0.29], 0.026, 0.024),
      color: COAT_LOW,
    });
    list.push({
      bone: `hoofH${s}`,
      geometry: limb([x, 0.075, -0.288], [x, 0.012, -0.278], 0.029, 0.034, 12),
      color: HOOF,
      slot: 'gloss',
    });
  }
  return list;
}

const WALK: LegSpec[] = [
  { upper: 'legHL1', lower: 'legHL2', paw: 'hoofHL', phase: 0, front: false },
  { upper: 'legFL1', lower: 'legFL2', paw: 'hoofFL', phase: 0.25, front: true },
  { upper: 'legHR1', lower: 'legHR2', paw: 'hoofHR', phase: 0.5, front: false },
  { upper: 'legFR1', lower: 'legFR2', paw: 'hoofFR', phase: 0.75, front: true },
];
// Transverse gallop footfall order: HL, HR, FL, FR.
const GALLOP: LegSpec[] = [
  { upper: 'legHL1', lower: 'legHL2', paw: 'hoofHL', phase: 0, front: false },
  { upper: 'legHR1', lower: 'legHR2', paw: 'hoofHR', phase: 0.1, front: false },
  { upper: 'legFL1', lower: 'legFL2', paw: 'hoofFL', phase: 0.38, front: true },
  { upper: 'legFR1', lower: 'legFR2', paw: 'hoofFR', phase: 0.48, front: true },
];
const TAIL = ['tail1', 'tail2'];

/**
 * Rearing pose: pitches the body up around the hind feet while keeping the
 * hind legs planted and folding the forelegs.
 */
function rear(p: PoseWriter, k: number, paw: number) {
  const a = 0.85 * k;
  p.rot('body', -a);
  p.move('body', 0, Math.sin(a) * 0.22, -(1 - Math.cos(a)) * 0.2);
  p.rot('legHL1', a * 0.9);
  p.rot('legHR1', a * 0.9);
  p.rot('legFL1', -0.5 * k + paw * 0.4);
  p.rot('legFR1', -0.6 * k - paw * 0.4);
  p.rot('legFL2', 1.1 * k);
  p.rot('legFR2', 1.2 * k);
  p.rot('neck1', 0.25 * k);
}

export function buildHorse(): ProxyBuild {
  const rig = buildRig({
    name: 'horse',
    bones: BONES,
    parts: parts(),
    materials: createProxyMaterials(),
  });
  const clip = (name: string, d: number, fn: Parameters<typeof sampleClip>[3]) =>
    sampleClip(rig, name, d, fn);

  const clips = [
    clip('Idle', D.idle, (t, p) => {
      breathe(p, t, D.idle, 'body', 0.01);
      p.rot('neck1', 0.08 + 0.03 * wave(t, D.idle, 1));
      p.rot('head', 0.04 * wave(t, D.idle, 1, 0.3), 0.1 * wave(t, D.idle, 1, 0.1));
      tailSway(p, t, D.idle, TAIL, 0.18, 2);
      p.rot('earL', 0, 0.6 * pulse(t, 0.8, 1.1));
      p.rot('earR', 0, -0.5 * pulse(t, 2.2, 2.5));
      p.rot('legHR2', 0.25 * pulse(t, 1.2, 2.8));
    }),
    clip('Anticipation', D.anticipation, (t, p) => {
      p.rot('neck1', -0.15);
      p.rot('head', -0.1 + 0.05 * wave(t, D.anticipation, 2));
      p.rot('legFL1', -0.45 * pulse(t, 0.1, 0.6));
      p.rot('legFL2', 0.8 * pulse(t, 0.1, 0.6));
      tailSway(p, t, D.anticipation, TAIL, 0.25, 2, 0.15);
    }),
    clip('Walk', D.walk, (t, p) => {
      quadrupedGait(p, t, D.walk, WALK, { swing: 0.36, lift: 0.8, bob: 0.012, bodyBone: 'body' });
      p.rot('neck1', 0.06 * wave(t, D.walk, 2));
      p.rot('head', 0.05 * wave(t, D.walk, 2, 0.2));
      tailSway(p, t, D.walk, TAIL, 0.12, 1);
    }),
    clip('Run', D.run, (t, p) => {
      quadrupedGait(p, t, D.run, GALLOP, {
        swing: 0.85,
        lift: 1.1,
        bob: 0.05,
        bodyBone: 'body',
        pitch: 0.08,
      });
      p.rot('neck1', 0.14 * wave(t, D.run, 1, 0.25));
      p.rot('head', 0.1);
      tailSway(p, t, D.run, TAIL, 0.1, 1, -0.5);
    }),
    clip('Entry', D.entry, (t, p) => {
      const push = pulse(t, 0, 0.35);
      const air = pulse(t, 0.25, 0.65);
      p.rot('body', -0.25 * push + 0.15 * air);
      p.move('body', 0, -0.04 * push, 0);
      p.rot('legFL2', 1.4 * air);
      p.rot('legFR2', 1.4 * air);
      p.rot('legFL1', -0.5 * air);
      p.rot('legFR1', -0.5 * air);
      p.rot('legHL1', 0.6 * air);
      p.rot('legHR1', 0.6 * air);
      p.rot('neck1', 0.2 * air);
    }),
    clip('Land', D.land, (t, p) => {
      const k = pulse(t, 0, D.land);
      p.move('body', 0, -0.035 * k, 0);
      p.rot('neck1', 0.12 * k);
    }),
    // Attack (vs fox): forward charge finishing with a double forehoof stomp.
    clip('Attack', D.attack, (t, p) => {
      const charge = ramp(t, 0, 0.35) * (1 - ramp(t, 0.85, 1));
      const lift = pulse(t, 0.35, 0.62);
      const stomp = pulse(t, 0.6, 0.75);
      p.rot('neck1', 0.25 * charge);
      p.rot('body', -0.35 * lift + 0.1 * stomp);
      p.move('body', 0, 0.06 * lift, 0);
      p.rot('legFL1', -0.7 * lift);
      p.rot('legFR1', -0.6 * lift);
      p.rot('legFL2', 1.0 * lift);
      p.rot('legFR2', 1.0 * lift);
      tailSway(p, t, D.attack, TAIL, 0.3, 3, 0.2);
    }),
    // AttackRear (vs lion): rears high and strikes down with the forehooves.
    clip('AttackRear', D.attack, (t, p) => {
      const up = ramp(t, 0, 0.45) * (1 - ramp(t, 0.7, 0.95));
      rear(p, up, Math.sin(t * 24) * up);
      p.rot('head', -0.2 * up, 0.15 * Math.sin(t * 9) * up);
      p.rot('earL', 0, 0, -0.5 * up);
      p.rot('earR', 0, 0, 0.5 * up);
      tailSway(p, t, D.attack, TAIL, 0.4, 3, 0.3 * up);
    }),
    // AttackGallop (vs peacock): a short charge with a sweeping head toss.
    clip('AttackGallop', D.attack, (t, p) => {
      quadrupedGait(p, t, D.attack / 2, GALLOP, {
        swing: 0.8,
        lift: 1.0,
        bob: 0.045,
        bodyBone: 'body',
        pitch: 0.07,
      });
      const toss = pulse(t, 0.5, 0.85);
      p.rot('neck1', -0.3 * toss, 0.35 * toss);
      p.rot('head', -0.25 * toss);
      tailSway(p, t, D.attack, TAIL, 0.15, 2, -0.4);
    }),
    // React (vs fox nip): startled hind-leg kick.
    clip('React', D.react, (t, p) => {
      const kick = pulse(t, 0.1, 0.55);
      p.rot('body', 0.3 * kick);
      p.move('body', 0, 0.03 * kick, 0);
      p.rot('legHL1', -0.9 * kick);
      p.rot('legHR1', -1.0 * kick);
      p.rot('legHL2', -0.6 * kick);
      p.rot('legHR2', -0.6 * kick);
      p.rot('neck1', -0.2 * kick);
      tailSway(p, t, D.react, TAIL, 0.4, 3, 0.4 * kick);
    }),
    // ReactRear (vs lion): rears in alarm, head twisting away.
    clip('ReactRear', D.react, (t, p) => {
      const up = pulse(t, 0, D.react);
      rear(p, up * 0.85, Math.sin(t * 20) * up);
      p.rot('neck1', 0, -0.35 * up);
      p.rot('head', -0.3 * up);
      p.rot('earL', 0, 0, -0.7 * up);
      p.rot('earR', 0, 0, 0.7 * up);
    }),
    // ReactShy (vs peacock): shies sideways away from the sudden display.
    clip('ReactShy', D.react, (t, p) => {
      const k = pulse(t, 0, D.react);
      p.rot('body', 0, 0.45 * k, -0.08 * k);
      p.move('body', 0.06 * k, 0, -0.03 * k);
      p.rot('neck1', -0.25 * k, -0.4 * k);
      p.rot('legFL1', -0.4 * k, 0, 0.3 * k);
      p.rot('legFR1', 0, 0, 0.3 * k);
    }),
    clip('ReturnHome', D.returnHome, (t, p) => {
      quadrupedGait(p, t, D.returnHome, GALLOP, {
        swing: 0.8,
        lift: 1.0,
        bob: 0.045,
        bodyBone: 'body',
        pitch: 0.07,
      });
      p.rot('neck1', 0.3);
      tailSway(p, t, D.returnHome, TAIL, 0.1, 1, -0.3);
    }),
    clip('Victory', D.victory, (t, p) => {
      const up = pulse(t, 0.1, 1.5);
      rear(p, up, Math.sin(t * 18) * up);
      p.rot('head', -0.3 * up, 0.25 * Math.sin(t * 5) * up);
      tailSway(p, t, D.victory, TAIL, 0.35, 3, 0.2);
    }),
  ];
  return { rig, clips, footprintLength: 1.02 };
}
