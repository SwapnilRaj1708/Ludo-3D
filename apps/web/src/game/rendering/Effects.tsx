'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { YARD_RECTS, type SeatIndex } from '@ludo3d/shared';
import type { PresentationController } from '../animations/PresentationController';
import { BOARD_SURFACE_Y, boardToWorld } from './coords';

const MAX = 120;
const dummy = new THREE.Object3D();

/** Instanced dust puffs, drifting feathers and gold sparkles. */
export function Particles({ controller }: { controller: PresentationController }) {
  const dust = useRef<THREE.InstancedMesh>(null);
  const feathers = useRef<THREE.InstancedMesh>(null);
  const sparkles = useRef<THREE.InstancedMesh>(null);
  const assets = useMemo(
    () => ({
      dustGeo: new THREE.IcosahedronGeometry(1, 1),
      dustMat: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 1,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      featherGeo: new THREE.PlaneGeometry(1, 0.32),
      featherMat: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
      sparkleGeo: new THREE.OctahedronGeometry(1, 0),
      sparkleMat: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    }),
    [],
  );

  useFrame((state) => {
    const meshes = { dust: dust.current, feathers: feathers.current, sparkle: sparkles.current };
    const counts = { dust: 0, feathers: 0, sparkle: 0 };
    const time = state.clock.elapsedTime;
    for (const p of controller.fx) {
      const mesh = meshes[p.kind];
      if (!mesh || counts[p.kind] >= MAX) continue;
      const k = p.life / p.maxLife;
      const fade = Math.sin(Math.PI * Math.min(1, k * 1.2));
      dummy.position.copy(p.pos);
      if (p.kind === 'dust') {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.size * (0.4 + fade * 0.8));
      } else if (p.kind === 'feathers') {
        dummy.rotation.set(
          Math.sin(time * 6 + p.spin) * 0.8,
          p.spin * time,
          Math.cos(time * 5 + p.spin) * 0.6,
        );
        dummy.scale.setScalar(p.size * 1.6 * (k < 0.85 ? 1 : (1 - k) / 0.15));
      } else {
        dummy.rotation.set(time * 3, time * 2 + p.spin, 0);
        dummy.scale.setScalar(p.size * fade * (0.7 + 0.3 * Math.sin(time * 25 + p.spin * 10)));
      }
      dummy.updateMatrix();
      const i = counts[p.kind]++;
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.color);
    }
    for (const kind of ['dust', 'feathers', 'sparkle'] as const) {
      const mesh = meshes[kind];
      if (!mesh) continue;
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group name="fx">
      <instancedMesh
        ref={dust}
        args={[assets.dustGeo, assets.dustMat, MAX]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={feathers}
        args={[assets.featherGeo, assets.featherMat, MAX]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={sparkles}
        args={[assets.sparkleGeo, assets.sparkleMat, MAX]}
        frustumCulled={false}
      />
    </group>
  );
}

function yardFrameGeometry(): THREE.ShapeGeometry {
  const rounded = (s: number, r: number) => {
    const p = new THREE.Shape();
    const h = s / 2;
    p.moveTo(-h + r, -h);
    p.lineTo(h - r, -h);
    p.quadraticCurveTo(h, -h, h, -h + r);
    p.lineTo(h, h - r);
    p.quadraticCurveTo(h, h, h - r, h);
    p.lineTo(-h + r, h);
    p.quadraticCurveTo(-h, h, -h, h - r);
    p.lineTo(-h, -h + r);
    p.quadraticCurveTo(-h, -h, -h + r, -h);
    return p;
  };
  const outer = rounded(6.12, 0.35);
  const inner = rounded(5.84, 0.25);
  outer.holes.push(inner);
  const g = new THREE.ShapeGeometry(outer, 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Glowing gold frame around the yard of the player whose turn it is. */
export function ActiveYardGlow({ controller }: { controller: PresentationController }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: yardFrameGeometry(),
      material: new THREE.MeshBasicMaterial({
        color: '#ffd27a',
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    }),
    [],
  );
  const centres = useMemo(() => {
    const out = {} as Record<SeatIndex, THREE.Vector3>;
    for (const seat of [0, 1, 2, 3] as SeatIndex[]) {
      const r = YARD_RECTS[seat];
      const w = boardToWorld({ x: r.minCol + 3, y: r.minRow + 3 });
      out[seat] = new THREE.Vector3(w.x, BOARD_SURFACE_Y + 0.012, w.z);
    }
    return out;
  }, []);
  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const target = centres[controller.activeSeat];
    m.position.lerp(target, 1 - Math.exp(-dt * 12));
    material.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 3) * 0.25;
  });
  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={2} />;
}

/** Destination preview ring shown while hovering a movable animal. */
export function TargetMarker({ targetRef }: { targetRef: React.RefObject<THREE.Vector3 | null> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new THREE.RingGeometry(0.3, 0.42, 40).rotateX(-Math.PI / 2),
      material: new THREE.MeshBasicMaterial({
        color: '#fff1c4',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      }),
    }),
    [],
  );
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const target = targetRef.current;
    m.visible = !!target;
    if (target) {
      m.position.set(target.x, BOARD_SURFACE_Y + 0.015, target.z);
      m.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 6) * 0.08);
    }
  });
  return (
    <mesh ref={mesh} geometry={geometry} material={material} visible={false} renderOrder={3} />
  );
}
