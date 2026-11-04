/**
 * Asset pipeline: builds the code-defined development proxies and writes them
 * as optimised GLB files to public/assets/animals/<species>.glb, so the game
 * exercises the same GLB loading path final production models will use.
 *
 *   pnpm --filter @ludo3d/web assets:proxies
 *
 * Steps: three.js GLTFExporter (skinned meshes, skeleton, 14 clips, PBR
 * extensions) → glTF-Transform: dedup, weld (index), prune, quantise and
 * Meshopt-compress (EXT_meshopt_compression; decoded by the game's loader).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SPECIES } from '@ludo3d/shared';
import { PROXY_BUILDERS } from '../src/game/characters/proxies';

// GLTFExporter packs binary GLBs through FileReader, which Node lacks.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader ??= NodeFileReader;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/assets/animals');
mkdirSync(outDir, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

for (const species of SPECIES) {
  const build = PROXY_BUILDERS[species]();
  const scene = new THREE.Scene();
  scene.add(build.rig.root);
  const exported = (await new GLTFExporter().parseAsync(build.rig.root, {
    binary: true,
    animations: build.clips,
    onlyVisible: false,
  })) as ArrayBuffer;

  const document = await io.readBinary(new Uint8Array(exported));
  document.getRoot().getAsset().generator =
    'Ludo 3D proxy pipeline (three.js GLTFExporter + glTF-Transform)';
  await document.transform(
    dedup(),
    weld(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  document.createExtension(EXTMeshoptCompression).setRequired(true);
  const glb = await io.writeBinary(document);
  const file = resolve(outDir, `${species}.glb`);
  writeFileSync(file, glb);
  console.log(
    `${species.padEnd(8)} raw ${(exported.byteLength / 1024).toFixed(0)} KB → optimised ${(glb.byteLength / 1024).toFixed(0)} KB, ${build.clips.length} clips`,
  );
}
