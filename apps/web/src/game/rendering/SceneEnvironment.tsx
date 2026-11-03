'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BOARD_SLAB } from '../board/Board';
import type { QualityProfile } from './quality';
import { canvasTexture, createCanvas, ctx2d, createNoise } from './textures';

export const BACKGROUND = '#100d0b';

/** Image-based lighting from a procedural studio room (no network fetch). */
function useStudioEnvironment(quality: QualityProfile) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    room.dispose();
    pmrem.dispose();
    return () => {
      env.dispose();
      scene.environment = null;
    };
  }, [gl, scene, quality.envMapSize]);
}

/** Large dark leather-topped table the board rests on, fading into the room. */
function Table() {
  const material = useMemo(() => {
    const size = 512;
    const canvas = createCanvas(size);
    const ctx = ctx2d(canvas);
    const img = ctx.createImageData(size, size);
    const { fbm } = createNoise(31);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 40, y / 40, 4);
        const fine = fbm(x / 4, y / 4, 2);
        const v = 0.55 + n * 0.3 + fine * 0.15;
        const i = (y * size + x) * 4;
        img.data[i] = 46 * v;
        img.data[i + 1] = 33 * v;
        img.data[i + 2] = 26 * v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.MeshStandardMaterial({
      map: canvasTexture(canvas, { srgb: true, repeat: 10 }),
      roughness: 0.82,
      metalness: 0,
    });
  }, []);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={-BOARD_SLAB.thickness - 0.001}
      receiveShadow
      material={material}
    >
      <circleGeometry args={[60, 64]} />
    </mesh>
  );
}

export function SceneEnvironment({ quality }: { quality: QualityProfile }) {
  useStudioEnvironment(quality);
  const keyLight = useMemo(() => {
    const light = new THREE.DirectionalLight('#ffe9cc', 3.0);
    light.position.set(-8, 17, 10);
    light.castShadow = quality.shadows;
    light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const cam = light.shadow.camera;
    cam.left = -12;
    cam.right = 12;
    cam.top = 12;
    cam.bottom = -12;
    cam.near = 4;
    cam.far = 45;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.025;
    light.shadow.radius = 3;
    return light;
  }, [quality.shadows, quality.shadowMapSize]);

  return (
    <>
      <color attach="background" args={[BACKGROUND]} />
      <hemisphereLight args={['#f2e8ff', '#3b2a1d', 0.45]} />
      <primitive object={keyLight} />
      <primitive object={keyLight.target} />
      <directionalLight position={[10, 9, -12]} intensity={0.75} color="#bcd2ff" />
      <pointLight position={[0, 6, 0]} intensity={14} distance={22} decay={2} color="#ffe2b3" />
      <Table />
    </>
  );
}
