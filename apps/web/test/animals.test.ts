import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SPECIES, allEncounterIds } from '@ludo3d/shared';
import { ENCOUNTERS, getEncounter } from '../src/game/animations/encounters';
import { ANIMAL_ASSETS } from '../src/game/assets/manifest';
import { ANIM_STATES } from '../src/game/characters/animStates';
import { PROXY_BUILDERS } from '../src/game/characters/proxies';

const builds = Object.fromEntries(SPECIES.map((s) => [s, PROXY_BUILDERS[s]()])) as Record<
  (typeof SPECIES)[number],
  ReturnType<(typeof PROXY_BUILDERS)['lion']>
>;

describe('development proxies', () => {
  it.each(SPECIES)('%s has a valid skeleton bound to skinned meshes', (species) => {
    const { rig } = builds[species];
    const meshes: THREE.SkinnedMesh[] = [];
    rig.root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.skeleton).toBe(rig.skeleton);
      const idx = mesh.geometry.getAttribute('skinIndex');
      for (let i = 0; i < idx.count; i++)
        expect(idx.getX(i)).toBeLessThan(rig.skeleton.bones.length);
    }
    const names = rig.skeleton.bones.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(SPECIES)('%s provides every required animation state and its variants', (species) => {
    const clipNames = new Set(builds[species].clips.map((c) => c.name));
    const entry = ANIMAL_ASSETS[species];
    for (const state of ANIM_STATES) expect(clipNames, state).toContain(entry.clips[state]);
    for (const extra of entry.extraClips) expect(clipNames, extra).toContain(extra);
  });

  it.each(SPECIES)('%s clips only animate bones that exist', (species) => {
    const { rig, clips } = builds[species];
    const bones = new Set(rig.skeleton.bones.map((b) => b.name));
    for (const clip of clips) {
      for (const track of clip.tracks) {
        const bone = track.name.split('.')[0]!;
        expect(bones, `${clip.name}:${track.name}`).toContain(bone);
        expect(clip.validate()).toBe(true);
      }
    }
  });

  it.each(SPECIES)('%s fits inside one board square after manifest scaling', (species) => {
    const { rig } = builds[species];
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    rig.root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox!);
      }
    });
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(ANIMAL_ASSETS[species].scale);
    expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(1.05);
    expect(size.y).toBeGreaterThan(0.35);
  });
});

describe('capture encounters', () => {
  it('define all twelve directed matchups exactly once', () => {
    const ids = ENCOUNTERS.map((e) => e.id).sort();
    expect(ids).toEqual(allEncounterIds().sort());
  });

  it('pair a unique attack variant with a unique reaction variant', () => {
    const pairs = new Set(
      ENCOUNTERS.map((e) => `${e.attacker}:${e.attackClip}|${e.defender}:${e.reactClip}`),
    );
    expect(pairs.size).toBe(12);
    // Each species uses three distinct attack and three distinct reaction clips.
    for (const species of SPECIES) {
      const attacks = new Set(
        ENCOUNTERS.filter((e) => e.attacker === species).map((e) => e.attackClip),
      );
      const reactions = new Set(
        ENCOUNTERS.filter((e) => e.defender === species).map((e) => e.reactClip),
      );
      expect(attacks.size).toBe(3);
      expect(reactions.size).toBe(3);
    }
  });

  it('stay within the 0.8–1.4 s target and reference real clips', () => {
    for (const e of ENCOUNTERS) {
      expect(e.duration).toBeGreaterThanOrEqual(0.8);
      expect(e.duration).toBeLessThanOrEqual(1.4);
      expect(e.impactAt).toBeGreaterThan(0.3);
      expect(e.impactAt).toBeLessThan(0.85);
      const attackerClips = builds[e.attacker].clips.map((c) => c.name);
      const defenderClips = builds[e.defender].clips.map((c) => c.name);
      expect(attackerClips).toContain(e.attackClip);
      expect(defenderClips).toContain(e.reactClip);
    }
  });

  it('falls back to a neutral interaction for unknown pairs', () => {
    expect(getEncounter('lion', 'lion').attackClip).toBe('Attack');
  });
});
