'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { lazy, Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { PieceId, Species } from '@ludo3d/shared';
import type { PresentationController } from '../animations/PresentationController';
import { Board } from '../board/Board';
import { loadAllAnimalTemplates, type AnimalTemplate } from '../characters/assetLibrary';
import { Pieces } from '../characters/Pieces';
import { Dice3D } from '../dice/Dice3D';
import { CAMERA_FOV, CameraRig } from './CameraRig';
import { ActiveYardGlow, Particles, TargetMarker } from './Effects';
import type { QualityProfile } from './quality';
import { publicConfig } from '@/services/config';
import { PerfProbe } from './PerfProbe';
import { SceneEnvironment } from './SceneEnvironment';

/** High profile only; split into its own chunk so Low/Medium never load it. */
const PostEffects = lazy(() => import('./PostEffects'));

export interface GameCanvasProps {
  controller: PresentationController;
  quality: QualityProfile;
  azimuth: number;
  reducedMotion: boolean;
  selectableRef: React.RefObject<ReadonlySet<PieceId>>;
  targetRef: React.RefObject<THREE.Vector3 | null>;
  onSelect: (id: PieceId) => void;
  onHover: (id: PieceId | null) => void;
  onAssetsReady?: (templates: Record<Species, AnimalTemplate>) => void;
  onPerformanceDecline?: () => void;
}

function FrameDriver({ controller }: { controller: PresentationController }) {
  // Negative priority: runs before the pieces read their positions, without
  // taking over rendering (only positive priorities do that).
  useFrame((_, dt) => controller.update(dt), -1);
  return null;
}

export default function GameCanvas(props: GameCanvasProps) {
  const { controller, quality, azimuth, reducedMotion } = props;
  const [templates, setTemplates] = useState<Record<Species, AnimalTemplate> | null>(null);
  const { onAssetsReady } = props;

  useEffect(() => {
    let cancelled = false;
    void loadAllAnimalTemplates().then((t) => {
      if (cancelled) return;
      setTemplates(t);
      onAssetsReady?.(t);
    });
    return () => {
      cancelled = true;
    };
  }, [onAssetsReady]);

  return (
    <Canvas
      shadows={quality.shadows ? 'percentage' : false}
      dpr={quality.dpr}
      gl={{
        antialias: quality.antialias,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
      }}
      camera={{ fov: CAMERA_FOV, near: 0.5, far: 200, position: [0, 30, 30] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
      data-testid="game-canvas"
      style={{ touchAction: 'none' }}
    >
      <FrameDriver controller={controller} />
      {publicConfig.e2e ? <PerfProbe /> : null}
      <PerformanceMonitor onDecline={() => props.onPerformanceDecline?.()} flipflops={2} />
      <SceneEnvironment quality={quality} />
      <CameraRig azimuth={azimuth} controller={controller} reducedMotion={reducedMotion} />
      <Board quality={quality} />
      <ActiveYardGlow controller={controller} />
      <TargetMarker targetRef={props.targetRef} />
      {templates ? (
        <Pieces
          controller={controller}
          templates={templates}
          selectableRef={props.selectableRef}
          onSelect={props.onSelect}
          onHover={props.onHover}
        />
      ) : null}
      <Dice3D controller={controller} />
      <Particles controller={controller} />
      {quality.postProcessing ? (
        <Suspense fallback={null}>
          <PostEffects />
        </Suspense>
      ) : null}
    </Canvas>
  );
}
