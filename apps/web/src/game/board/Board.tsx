'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEAT_INDICES, YARD_SLOTS } from '@ludo3d/shared';
import { BOARD_HALF, boardToWorld } from '../rendering/coords';
import { canvasTexture, heightToNormal, paintWood } from '../rendering/textures';
import type { QualityProfile } from '../rendering/quality';
import { ENAMEL, paintBoardFace } from './boardFace';

export const BOARD_SLAB = { size: 16.9, thickness: 0.62, radius: 0.22 };

function useBoardMaterials(quality: QualityProfile) {
  return useMemo(() => {
    const face = paintBoardFace(quality.boardTextureSize);
    const faceMaterial = new THREE.MeshPhysicalMaterial({
      map: canvasTexture(face.color, { srgb: true, anisotropy: quality.anisotropy }),
      normalMap: canvasTexture(face.normal, { anisotropy: quality.anisotropy }),
      roughnessMap: canvasTexture(face.orm, { anisotropy: quality.anisotropy }),
      metalnessMap: canvasTexture(face.orm, { anisotropy: quality.anisotropy }),
      aoMap: canvasTexture(face.orm, { anisotropy: quality.anisotropy }),
      aoMapIntensity: 0.8,
      roughness: 1,
      metalness: 1,
      normalScale: new THREE.Vector2(0.9, 0.9),
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
    });

    const wood = paintWood(quality.woodTextureSize);
    const woodMaterial = new THREE.MeshPhysicalMaterial({
      map: canvasTexture(wood.color, { srgb: true, anisotropy: quality.anisotropy }),
      normalMap: canvasTexture(heightToNormal(wood.height, 1.6), {
        anisotropy: quality.anisotropy,
      }),
      roughnessMap: canvasTexture(wood.roughness, { anisotropy: quality.anisotropy }),
      roughness: 1,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    });

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: '#c9a053',
      metalness: 1,
      roughness: 0.28,
    });
    const ivoryMaterial = new THREE.MeshPhysicalMaterial({
      color: '#f1e8d6',
      roughness: 0.36,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    });
    return { faceMaterial, woodMaterial, goldMaterial, ivoryMaterial };
  }, [quality.boardTextureSize, quality.woodTextureSize, quality.anisotropy]);
}

function useBoardGeometry() {
  return useMemo(() => {
    const slab = new RoundedBoxGeometry(
      BOARD_SLAB.size,
      BOARD_SLAB.thickness,
      BOARD_SLAB.size,
      4,
      BOARD_SLAB.radius,
    );
    slab.translate(0, -BOARD_SLAB.thickness / 2, 0);

    const face = new THREE.PlaneGeometry(BOARD_HALF * 2, BOARD_HALF * 2);
    face.rotateX(-Math.PI / 2);
    face.translate(0, 0.002, 0);

    // Gold trim: a thin raised frame hugging the play surface.
    const trimParts: THREE.BufferGeometry[] = [];
    const t = 0.09;
    const len = BOARD_HALF * 2 + t * 2;
    for (const [w, d, x, z] of [
      [len, t, 0, -BOARD_HALF - t / 2],
      [len, t, 0, BOARD_HALF + t / 2],
      [t, len, -BOARD_HALF - t / 2, 0],
      [t, len, BOARD_HALF + t / 2, 0],
    ] as const) {
      const g = new THREE.BoxGeometry(w, 0.05, d);
      g.translate(x, 0.025, z);
      trimParts.push(g);
    }
    const trim = mergeGeometries(trimParts)!;

    // Yard pads: shallow ivory discs with a gold ring where pieces rest.
    const padParts: THREE.BufferGeometry[] = [];
    const ringParts: THREE.BufferGeometry[] = [];
    for (const seat of SEAT_INDICES) {
      for (const slot of YARD_SLOTS[seat]) {
        const p = boardToWorld(slot);
        const pad = new THREE.CylinderGeometry(0.46, 0.49, 0.05, 40);
        pad.translate(p.x, 0.025, p.z);
        padParts.push(pad);
        const ring = new THREE.TorusGeometry(0.47, 0.022, 8, 48);
        ring.rotateX(-Math.PI / 2);
        ring.translate(p.x, 0.05, p.z);
        ringParts.push(ring);
      }
    }
    const medallion = new THREE.CylinderGeometry(0.26, 0.3, 0.06, 48);
    medallion.translate(0, 0.03, 0);
    ringParts.push(medallion);

    return {
      slab,
      face,
      trim,
      pads: mergeGeometries(padParts)!,
      gold: mergeGeometries(ringParts.map((g) => g.toNonIndexed()))!,
    };
  }, []);
}

/** Static board: built once from the shared layout; never re-renders during play. */
export function Board({ quality }: { quality: QualityProfile }) {
  const { faceMaterial, woodMaterial, goldMaterial, ivoryMaterial } = useBoardMaterials(quality);
  const geometry = useBoardGeometry();
  const castShadows = quality.shadows;

  return (
    <group name="board">
      <mesh
        geometry={geometry.slab}
        material={woodMaterial}
        receiveShadow
        castShadow={castShadows}
      />
      <mesh geometry={geometry.face} material={faceMaterial} receiveShadow />
      <mesh geometry={geometry.trim} material={goldMaterial} receiveShadow />
      <mesh
        geometry={geometry.pads}
        material={ivoryMaterial}
        receiveShadow
        castShadow={castShadows}
      />
      <mesh geometry={geometry.gold} material={goldMaterial} receiveShadow />
    </group>
  );
}

export function seatEnamel(seat: number): string {
  return ENAMEL[(seat as 0 | 1 | 2 | 3) ?? 0];
}
