'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { YARD_RECTS, type SeatIndex } from '@ludo3d/shared';
import type { PresentationController } from '../animations/PresentationController';
import { BOARD_SURFACE_Y, boardToWorld } from '../rendering/coords';

const SIZE = 0.44;
const HALF = SIZE / 2;

/** Face normals in die-local space; opposite faces sum to seven. */
export const FACE_NORMALS: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1),
  5: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
};

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** Orientation that shows `value` on the top face, with a free yaw. */
export function orientationFor(value: number, yaw: number): THREE.Quaternion {
  const normal = FACE_NORMALS[value] ?? FACE_NORMALS[1]!;
  const q = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

function buildPips(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spacing = 0.115;
  for (const [valueStr, normal] of Object.entries(FACE_NORMALS)) {
    const value = Number(valueStr);
    // Build a basis on the face: u, v perpendicular to the normal.
    const n = normal.clone();
    const u = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(n, u);
    for (const [a, b] of PIP_LAYOUT[value]!) {
      const pip = new THREE.SphereGeometry(0.036, 12, 8);
      pip.scale(1, 1, 1);
      const pos = n
        .clone()
        .multiplyScalar(HALF - 0.012)
        .addScaledVector(u, a * spacing)
        .addScaledVector(v, b * spacing);
      pip.translate(pos.x, pos.y, pos.z);
      parts.push(pip);
    }
  }
  return mergeGeometries(parts)!;
}

function diceRestPoint(seat: SeatIndex): THREE.Vector3 {
  const r = YARD_RECTS[seat];
  const w = boardToWorld({ x: r.minCol + 3, y: r.minRow + 3 });
  return new THREE.Vector3(w.x, BOARD_SURFACE_Y + HALF, w.z);
}

export function Dice3D({ controller }: { controller: PresentationController }) {
  const group = useRef<THREE.Group>(null);
  const { body, pips, bodyMaterial, pipMaterial } = useMemo(
    () => ({
      body: new RoundedBoxGeometry(SIZE, SIZE, SIZE, 5, 0.075),
      pips: buildPips(),
      bodyMaterial: new THREE.MeshPhysicalMaterial({
        color: '#f6f0e3',
        roughness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        sheen: 0.3,
        sheenColor: new THREE.Color('#fff8ea'),
      }),
      pipMaterial: new THREE.MeshPhysicalMaterial({
        color: '#7a1414',
        roughness: 0.35,
        clearcoat: 0.6,
      }),
    }),
    [],
  );

  const anim = useRef({
    rollId: -1,
    t: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    spinAxis: new THREE.Vector3(1, 0, 0),
    spinRate: 14,
    final: new THREE.Quaternion(),
    start: new THREE.Quaternion(),
  });

  useFrame((_, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dice = controller.dice;
    g.visible = dice.visible;
    if (!dice.visible) return;
    const a = anim.current;
    if (dice.rollId !== a.rollId) {
      a.rollId = dice.rollId;
      a.t = 0;
      a.to.copy(diceRestPoint(dice.seat));
      // Thrown in from the board centre side so it tumbles into the yard.
      a.from
        .copy(a.to)
        .multiplyScalar(0.55)
        .setY(BOARD_SURFACE_Y + 1.9);
      a.spinAxis.set(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize();
      a.spinRate = 16 + Math.random() * 8;
      a.final.copy(orientationFor(dice.value, Math.random() * Math.PI * 2));
      a.start.copy(g.quaternion);
    }
    const duration = Math.max(0.05, dice.duration);
    a.t = Math.min(duration, a.t + Math.min(rawDt, 0.25) * controller.speed);
    const k = a.t / duration;
    if (k < 1) {
      // Position: arc down with two decaying bounces.
      const travel = 1 - Math.pow(1 - Math.min(1, k * 1.25), 2);
      g.position.lerpVectors(a.from, a.to, travel);
      const bounce = Math.abs(Math.cos(k * Math.PI * 2.5)) * Math.pow(1 - k, 1.6) * 0.55;
      g.position.y = a.to.y + Math.max(0, (1 - k * 1.6) * 1.4) + bounce * (k > 0.35 ? 1 : 0);
      // Orientation: free tumble that settles onto the result face.
      const tumble = new THREE.Quaternion().setFromAxisAngle(
        a.spinAxis,
        a.spinRate * a.t * (1 - k * 0.6),
      );
      const free = a.start.clone().multiply(tumble);
      const settle = Math.max(0, (k - 0.55) / 0.45);
      g.quaternion.copy(free).slerp(a.final, settle * settle * (3 - 2 * settle));
    } else {
      g.position.copy(a.to);
      g.quaternion.copy(a.final);
    }
  });

  return (
    <group ref={group} name="dice" visible={false}>
      <mesh geometry={body} material={bodyMaterial} castShadow receiveShadow />
      <mesh geometry={pips} material={pipMaterial} />
    </group>
  );
}
