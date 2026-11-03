import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPECIES, type Species } from '@ludo3d/shared';
import { ANIMAL_ASSETS, type AnimalAssetEntry } from '../assets/manifest';
import { ANIM_STATES, type AnimState } from './animStates';
import { AnimalController } from './AnimalController';
import { PROXY_BUILDERS } from './proxies';

export type TemplateSource = 'glb' | 'runtime-proxy';

export interface AnimalTemplate {
  species: Species;
  entry: AnimalAssetEntry;
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  source: TemplateSource;
  /** Required states whose clip is missing (fallbacks will be used). */
  missingClips: AnimState[];
  loadMs: number;
  error?: string;
}

let loader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

const templates = new Map<Species, Promise<AnimalTemplate>>();

function finalize(
  species: Species,
  entry: AnimalAssetEntry,
  scene: THREE.Object3D,
  clips: THREE.AnimationClip[],
  source: TemplateSource,
  started: number,
  error?: string,
): AnimalTemplate {
  const names = new Set(clips.map((c) => c.name));
  const missingClips = ANIM_STATES.filter((s) => !names.has(entry.clips[s]));
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    }
  });
  return {
    species,
    entry,
    scene,
    clips,
    source,
    missingClips,
    loadMs: Math.round(performance.now() - started),
    error,
  };
}

function buildRuntimeProxy(species: Species, started: number, error?: string): AnimalTemplate {
  const build = PROXY_BUILDERS[species]();
  return finalize(
    species,
    ANIMAL_ASSETS[species],
    build.rig.root,
    build.clips,
    'runtime-proxy',
    started,
    error,
  );
}

/**
 * Loads (once) the template for a species: the GLB named in the manifest, or
 * — if it is missing or fails to parse — the code-built development proxy.
 * Failures are reported, never hidden.
 */
export function loadAnimalTemplate(species: Species): Promise<AnimalTemplate> {
  const cached = templates.get(species);
  if (cached) return cached;
  const entry = ANIMAL_ASSETS[species];
  const started = performance.now();
  const promise = getLoader()
    .loadAsync(entry.path)
    .then((gltf) => finalize(species, entry, gltf.scene, gltf.animations, 'glb', started))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[assets] ${entry.path} unavailable (${message}); using runtime proxy for ${species}`,
      );
      return buildRuntimeProxy(species, started, message);
    });
  templates.set(species, promise);
  return promise;
}

export function loadAllAnimalTemplates(): Promise<Record<Species, AnimalTemplate>> {
  return Promise.all(SPECIES.map((s) => loadAnimalTemplate(s))).then(
    (list) =>
      Object.fromEntries(list.map((t) => [t.species, t])) as Record<Species, AnimalTemplate>,
  );
}

export interface AnimalInstance {
  /** Wrapper positioned by the game; the model inside carries manifest corrections. */
  object: THREE.Group;
  controller: AnimalController;
  template: AnimalTemplate;
}

export function instantiateAnimal(template: AnimalTemplate): AnimalInstance {
  const model = cloneSkinned(template.scene);
  const { entry } = template;
  model.scale.setScalar(entry.scale);
  model.rotation.set(...entry.rotation);
  model.position.set(...entry.position);
  const object = new THREE.Group();
  object.name = `${template.species}-instance`;
  object.add(model);
  const controller = new AnimalController(model, template.clips, entry.clips);
  return { object, controller, template };
}

/** Duration in seconds of the clip a state/variant resolves to (fallbacks included). */
export function clipDuration(template: AnimalTemplate, state: AnimState, variant?: string): number {
  const names = [variant, template.entry.clips[state]].filter(Boolean) as string[];
  for (const name of names) {
    const clip = template.clips.find((c) => c.name === name);
    if (clip) return clip.duration;
  }
  return 0.6;
}
