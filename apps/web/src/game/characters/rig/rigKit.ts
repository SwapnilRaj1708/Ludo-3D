import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Toolkit for building rigged development proxies in code: a bone hierarchy,
 * rigidly skinned body parts merged per material, and keyframed animation
 * clips sampled from procedural pose functions. The output has the same shape
 * as a rigged glTF character (SkinnedMesh + Skeleton + AnimationClips), so the
 * rest of the pipeline cannot tell proxies and final assets apart.
 */

export type Vec3 = readonly [number, number, number];

export interface BoneSpec {
  name: string;
  parent: string | null;
  /** Joint position in model space at rest. */
  at: Vec3;
}

export type MaterialSlot = 'fur' | 'gloss' | 'plume' | 'feather';

export interface PartSpec {
  bone: string;
  /** Geometry already positioned in model space. Ownership passes to the rig. */
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation);
  slot?: MaterialSlot;
}

export interface RigSpec {
  name: string;
  bones: BoneSpec[];
  parts: PartSpec[];
  materials: Partial<Record<MaterialSlot, THREE.Material>>;
}

export interface BuiltRig {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Map<string, THREE.Bone>;
  restPositions: Map<string, THREE.Vector3>;
}

const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

function prepareGeometry(part: PartSpec, boneIndex: number): THREE.BufferGeometry {
  let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
  // Keep only the attributes every part shares so they can be merged.
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2),
    );
  }
  const count = g.attributes.position!.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const pos = g.attributes.position!;
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = boneIndex;
    skinWeight[i * 4] = 1;
    if (typeof part.color === 'function') {
      tmpVec.fromBufferAttribute(pos, i);
      tmpColor.set(part.color(tmpVec));
    } else {
      tmpColor.set(part.color);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g = g.clone();
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

export function buildRig(spec: RigSpec): BuiltRig {
  const root = new THREE.Group();
  root.name = spec.name;
  const bones = new Map<string, THREE.Bone>();
  const restPositions = new Map<string, THREE.Vector3>();
  const absolute = new Map<string, THREE.Vector3>();

  for (const b of spec.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    const abs = new THREE.Vector3(...b.at);
    absolute.set(b.name, abs);
    if (b.parent) {
      const parent = bones.get(b.parent);
      const parentAbs = absolute.get(b.parent);
      if (!parent || !parentAbs) throw new Error(`Bone ${b.name}: unknown parent ${b.parent}`);
      bone.position.copy(abs).sub(parentAbs);
      parent.add(bone);
    } else {
      bone.position.copy(abs);
      root.add(bone);
    }
    restPositions.set(b.name, bone.position.clone());
    bones.set(b.name, bone);
  }

  root.updateMatrixWorld(true);
  const boneList = spec.bones.map((b) => bones.get(b.name)!);
  const skeleton = new THREE.Skeleton(boneList);
  const indexOf = new Map(spec.bones.map((b, i) => [b.name, i]));

  const bySlot = new Map<MaterialSlot, THREE.BufferGeometry[]>();
  for (const part of spec.parts) {
    const index = indexOf.get(part.bone);
    if (index === undefined) throw new Error(`Part references unknown bone ${part.bone}`);
    const slot = part.slot ?? 'fur';
    const list = bySlot.get(slot) ?? [];
    list.push(prepareGeometry(part, index));
    bySlot.set(slot, list);
  }

  for (const [slot, geometries] of bySlot) {
    const material = spec.materials[slot];
    if (!material) throw new Error(`No material for slot ${slot}`);
    const merged = mergeGeometries(geometries);
    if (!merged) throw new Error(`Failed to merge ${slot} geometry`);
    merged.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(merged, material);
    mesh.name = `${spec.name}_${slot}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    mesh.bind(skeleton);
    // Skinned bounds change with the pose; avoid incorrect culling.
    mesh.frustumCulled = false;
  }
  return { root, skeleton, bones, restPositions };
}

// ---------------------------------------------------------------------------
// Procedural animation clips
// ---------------------------------------------------------------------------

export interface PoseWriter {
  /** Rotation (radians, XYZ Euler) relative to the bone's rest orientation. */
  rot(bone: string, x: number, y?: number, z?: number): void;
  /** Translation offset from the bone's rest position (model units). */
  move(bone: string, x: number, y: number, z: number): void;
  scale(bone: string, s: number | Vec3): void;
  /** Absolute rotation relative to rest as a quaternion (overrides `rot` for this frame). */
  quat(bone: string, q: THREE.Quaternion): void;
}

export type PoseFn = (t: number, pose: PoseWriter) => void;

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();

export function sampleClip(
  rig: Pick<BuiltRig, 'restPositions'>,
  name: string,
  duration: number,
  fn: PoseFn,
  fps = 30,
): THREE.AnimationClip {
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  const rotations = new Map<string, Float32Array>();
  const positions = new Map<string, Float32Array>();
  const scales = new Map<string, Float32Array>();
  const touched = { rot: new Set<string>(), move: new Set<string>(), scale: new Set<string>() };

  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * duration;
    times[f] = t;
    const frameRot = new Map<string, Vec3>();
    const frameMove = new Map<string, Vec3>();
    const frameScale = new Map<string, Vec3>();
    const frameQuat = new Map<string, THREE.Quaternion>();
    fn(t, {
      quat: (bone, q) => {
        frameQuat.set(bone, q.clone());
        touched.rot.add(bone);
      },
      rot: (bone, x, y = 0, z = 0) => {
        const prev = frameRot.get(bone);
        frameRot.set(bone, prev ? [prev[0] + x, prev[1] + y, prev[2] + z] : [x, y, z]);
        touched.rot.add(bone);
      },
      move: (bone, x, y, z) => {
        const prev = frameMove.get(bone);
        frameMove.set(bone, prev ? [prev[0] + x, prev[1] + y, prev[2] + z] : [x, y, z]);
        touched.move.add(bone);
      },
      scale: (bone, s) => {
        frameScale.set(bone, typeof s === 'number' ? [s, s, s] : s);
        touched.scale.add(bone);
      },
    });
    for (const bone of touched.rot) {
      const arr = rotations.get(bone) ?? new Float32Array(frames * 4);
      const direct = frameQuat.get(bone);
      if (direct) {
        quat.copy(direct);
      } else {
        const r = frameRot.get(bone) ?? [0, 0, 0];
        quat.setFromEuler(euler.set(r[0], r[1], r[2]));
      }
      arr.set([quat.x, quat.y, quat.z, quat.w], f * 4);
      rotations.set(bone, arr);
    }
    for (const bone of touched.move) {
      const rest = rig.restPositions.get(bone);
      if (!rest) throw new Error(`${name}: unknown bone ${bone}`);
      let arr = positions.get(bone);
      if (!arr) {
        arr = new Float32Array(frames * 3);
        for (let k = 0; k < frames; k++) arr.set([rest.x, rest.y, rest.z], k * 3);
      }
      const m = frameMove.get(bone) ?? [0, 0, 0];
      arr.set([rest.x + m[0], rest.y + m[1], rest.z + m[2]], f * 3);
      positions.set(bone, arr);
    }
    for (const bone of touched.scale) {
      const arr = scales.get(bone) ?? new Float32Array(frames * 3).fill(1);
      arr.set(frameScale.get(bone) ?? [1, 1, 1], f * 3);
      scales.set(bone, arr);
    }
  }

  // Bones first touched mid-clip have zeroed early frames; fill with identity.
  for (const [bone, arr] of rotations) {
    for (let f = 0; f < frames; f++) {
      if (
        arr[f * 4 + 3] === 0 &&
        arr[f * 4] === 0 &&
        arr[f * 4 + 1] === 0 &&
        arr[f * 4 + 2] === 0
      ) {
        arr[f * 4 + 3] = 1;
      }
    }
    rotations.set(bone, arr);
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, values] of rotations) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  for (const [bone, values] of positions) {
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, values));
  }
  for (const [bone, values] of scales) {
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.scale`, times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;
export const deg = (d: number) => (d * Math.PI) / 180;
/** Periodic wave in [-1, 1] for loop clips: `cycles` full periods over `duration`. */
export const wave = (t: number, duration: number, cycles = 1, phase = 0) =>
  Math.sin(TAU * (t / duration) * cycles + TAU * phase);
export const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
/** 0 → 1 → 0 bell over [start, end] (seconds). */
export const pulse = (t: number, start: number, end: number) => {
  if (t <= start || t >= end) return 0;
  const k = (t - start) / (end - start);
  return Math.sin(Math.PI * k);
};
/** Eased ramp from 0 to 1 over [start, end]. */
export const ramp = (t: number, start: number, end: number) => smooth((t - start) / (end - start));
