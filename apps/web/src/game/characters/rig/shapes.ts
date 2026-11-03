import * as THREE from 'three';
import type { Vec3 } from './rigKit';

const UP = new THREE.Vector3(0, 1, 0);

/** Ellipsoid centred at `c` with radii (rx, ry, rz). */
export function ellipsoid(c: Vec3, r: Vec3, segments = 20): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.max(8, Math.round(segments * 0.66)));
  g.scale(r[0], r[1], r[2]);
  g.translate(c[0], c[1], c[2]);
  return g;
}

/** Rotated ellipsoid: radii given in its local frame, then rotated by Euler XYZ. */
export function ellipsoidRot(c: Vec3, r: Vec3, rot: Vec3, segments = 20): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.max(8, Math.round(segments * 0.66)));
  g.scale(r[0], r[1], r[2]);
  g.applyMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
  );
  g.translate(c[0], c[1], c[2]);
  return g;
}

/**
 * A limb segment from `a` to `b`: a tapered cylinder with rounded ends.
 * Radii taper from `ra` at a to `rb` at b.
 */
export function limb(a: Vec3, b: Vec3, ra: number, rb: number, radial = 12): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const profile: THREE.Vector2[] = [];
  const capSteps = 5;
  // Bottom cap (at a), shaft, top cap (at b) along +Y from 0 to len.
  for (let i = 0; i <= capSteps; i++) {
    const ang = -Math.PI / 2 + (i / capSteps) * (Math.PI / 2);
    profile.push(new THREE.Vector2(Math.cos(ang) * ra, Math.sin(ang) * ra));
  }
  for (let i = 0; i <= capSteps; i++) {
    const ang = (i / capSteps) * (Math.PI / 2);
    profile.push(new THREE.Vector2(Math.cos(ang) * rb, len + Math.sin(ang) * rb));
  }
  const g = new THREE.LatheGeometry(profile, radial);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(q);
  g.translate(va.x, va.y, va.z);
  return g;
}

/** Cone from base centre `a` (radius r) to tip `b`. */
export function cone(a: Vec3, b: Vec3, r: number, radial = 12): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const g = new THREE.ConeGeometry(r, len, radial, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(va.x, va.y, va.z);
  return g;
}

/** Tube along a Catmull-Rom curve through `points`, radius varying with t ∈ [0,1]. */
export function taperedTube(
  points: readonly Vec3[],
  radius: (t: number) => number,
  segments = 24,
  radial = 12,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = Math.max(0.0005, radius(t));
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      n.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize();
      positions.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Close both ends with small fans so tails/necks read as solid.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/**
 * Ellipsoid whose surface is displaced by smooth noise: used for manes, fur
 * ruffs and bushy tails so silhouettes read as hair rather than plastic.
 */
export function shaggy(
  c: Vec3,
  r: Vec3,
  amount: number,
  frequency = 9,
  segments = 28,
  seed = 1,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.7));
  const pos = g.attributes.position!;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * frequency + seed) * Math.cos(v.y * frequency * 1.3 + seed * 2) +
      Math.sin(v.z * frequency * 1.7 - seed) * 0.6 +
      Math.sin((v.x + v.y) * frequency * 2.3) * 0.35;
    const k = 1 + n * amount;
    pos.setXYZ(i, v.x * k * r[0], v.y * k * r[1], v.z * k * r[2]);
  }
  g.computeVertexNormals();
  g.translate(c[0], c[1], c[2]);
  return g;
}

/** Flat leaf/feather blade lying in the XZ plane pointing along +Z, base at origin. */
export function blade(length: number, width: number, segments = 10): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = Math.sin(Math.PI * Math.pow(t, 0.85)) * width * (0.35 + 0.65 * t);
    shape.lineTo(w, t * length);
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const w = Math.sin(Math.PI * Math.pow(t, 0.85)) * width * (0.35 + 0.65 * t);
    shape.lineTo(-w, t * length);
  }
  const g = new THREE.ShapeGeometry(shape, 2);
  g.rotateX(Math.PI / 2); // shape Y → model Z
  return g;
}

/** Concentric disc used for peacock "eye" ocelli, lying in the XZ plane. */
export function disc(radius: number, segments = 20): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, segments);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function transformed(
  g: THREE.BufferGeometry,
  opts: { rot?: Vec3; at?: Vec3; scale?: Vec3 },
): THREE.BufferGeometry {
  if (opts.scale) g.scale(opts.scale[0], opts.scale[1], opts.scale[2]);
  if (opts.rot) {
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.rot)));
  }
  if (opts.at) g.translate(opts.at[0], opts.at[1], opts.at[2]);
  return g;
}

export function mirrorX(v: Vec3): Vec3 {
  return [-v[0], v[1], v[2]];
}
