'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { SPECIES, type Species } from '@ludo3d/shared';
import {
  instantiateAnimal,
  loadAllAnimalTemplates,
  type AnimalTemplate,
} from '@/game/characters/assetLibrary';
import { QUALITY_PROFILES } from '@/game/rendering/quality';
import { SceneEnvironment } from '@/game/rendering/SceneEnvironment';

function Animal({
  template,
  x,
  clip,
  time,
}: {
  template: AnimalTemplate;
  x: number;
  clip: string;
  time: number;
}) {
  const instance = useMemo(() => instantiateAnimal(template), [template]);
  useEffect(() => {
    const action = instance.controller.mixer.clipAction(
      template.clips.find((c) => c.name === clip) ?? template.clips[0]!,
    );
    action.play();
    if (time >= 0) {
      action.paused = false;
      instance.controller.mixer.setTime(time);
      action.paused = true;
    }
    return () => {
      instance.controller.mixer.stopAllAction();
    };
  }, [instance, template, clip, time]);
  useFrame((_, dt) => {
    if (time < 0) instance.controller.update(dt);
  });
  return (
    <group position={[x, 0, 0]} rotation-y={-0.6}>
      <primitive object={instance.object} />
    </group>
  );
}

export default function ShowcaseCanvas({ clip, time }: { clip: string; time: number }) {
  const [templates, setTemplates] = useState<Record<Species, AnimalTemplate> | null>(null);
  useEffect(() => {
    void loadAllAnimalTemplates().then(setTemplates);
  }, []);
  return (
    <Canvas
      shadows="percentage"
      camera={{ fov: 30, position: [0, 1.6, 5.2] }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.AgXToneMapping;
        camera.lookAt(0, 0.35, 0);
      }}
      data-testid="showcase"
      data-ready={templates ? '1' : '0'}
    >
      <SceneEnvironment quality={QUALITY_PROFILES.high} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#efe3cc" roughness={0.5} />
      </mesh>
      {templates
        ? SPECIES.map((s, i) => (
            <Animal key={s} template={templates[s]} x={(i - 1.5) * 1.05} clip={clip} time={time} />
          ))
        : null}
    </Canvas>
  );
}
