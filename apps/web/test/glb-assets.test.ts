import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SPECIES } from '@ludo3d/shared';
import { ANIMAL_ASSETS } from '../src/game/assets/manifest';
import { ANIM_STATES } from '../src/game/characters/animStates';

/** Loads a GLB exactly as the game does (GLTFLoader + Meshopt decoder). */
function load(species: string): Promise<GLTF> {
  const file = resolve(__dirname, `../public/assets/animals/${species}.glb`);
  const bytes = readFileSync(file);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((ok, fail) => loader.parse(buffer, '', ok, fail));
}

describe.each(SPECIES)('%s.glb', (species) => {
  it('is a compact, rigged, animated character with every required clip', async () => {
    const size = statSync(resolve(__dirname, `../public/assets/animals/${species}.glb`)).size;
    expect(size).toBeLessThan(400 * 1024);

    const gltf = await load(species);
    const skinned: THREE.SkinnedMesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
    });
    expect(skinned.length).toBeGreaterThan(0);
    expect(skinned[0]!.skeleton.bones.length).toBeGreaterThan(15);

    const names = new Set(gltf.animations.map((c) => c.name));
    const entry = ANIMAL_ASSETS[species];
    for (const state of ANIM_STATES) expect(names, state).toContain(entry.clips[state]);
    for (const extra of entry.extraClips) expect(names, extra).toContain(extra);

    // Every animation track must bind to a node that exists in the scene.
    const nodeNames = new Set<string>();
    gltf.scene.traverse((o) => nodeNames.add(o.name));
    for (const clip of gltf.animations) {
      for (const track of clip.tracks) {
        expect(nodeNames, `${clip.name}:${track.name}`).toContain(track.name.split('.')[0]);
      }
    }

    // PBR extensions survive the round trip (fur sheen / plumage iridescence).
    const materials = new Set<THREE.Material>();
    for (const mesh of skinned) materials.add(mesh.material as THREE.Material);
    const physical = [...materials].filter(
      (m) => (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial,
    );
    expect(physical.length).toBeGreaterThan(0);
    if (species === 'peacock') {
      expect(physical.some((m) => (m as THREE.MeshPhysicalMaterial).iridescence > 0)).toBe(true);
    } else {
      expect(physical.some((m) => (m as THREE.MeshPhysicalMaterial).sheen > 0)).toBe(true);
    }
  });
});
