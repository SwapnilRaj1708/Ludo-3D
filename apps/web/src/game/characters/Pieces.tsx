'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PieceId, SeatIndex, Species } from '@ludo3d/shared';
import { ENAMEL } from '../board/boardFace';
import type { PieceVisual, PresentationController } from '../animations/PresentationController';
import { instantiateAnimal, type AnimalTemplate } from './assetLibrary';
import type { AnimState } from './animStates';

const BASE_HEIGHT = 0.05;

/** Shared geometries/materials so 16 pieces cost a handful of programs. */
function useSharedPieceAssets() {
  return useMemo(() => {
    const base = new THREE.CylinderGeometry(0.37, 0.4, BASE_HEIGHT, 40);
    base.translate(0, BASE_HEIGHT / 2, 0);
    const rim = new THREE.TorusGeometry(0.385, 0.013, 8, 48);
    rim.rotateX(-Math.PI / 2);
    rim.translate(0, BASE_HEIGHT, 0);
    const ring = new THREE.TorusGeometry(0.45, 0.028, 10, 56);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0.03, 0);
    const hit = new THREE.CylinderGeometry(0.46, 0.46, 1.0, 12);
    hit.translate(0, 0.5, 0);
    const enamel = (seat: SeatIndex) =>
      new THREE.MeshPhysicalMaterial({
        color: ENAMEL[seat],
        roughness: 0.3,
        clearcoat: 0.8,
        clearcoatRoughness: 0.15,
      });
    const baseMaterials: Record<SeatIndex, THREE.Material> = {
      0: enamel(0),
      1: enamel(1),
      2: enamel(2),
      3: enamel(3),
    };
    const gold = new THREE.MeshStandardMaterial({
      color: '#d2a95c',
      metalness: 1,
      roughness: 0.25,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd27a',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return { base, rim, ring, hit, baseMaterials, gold, ringMaterial, hitMaterial };
  }, []);
}

type Shared = ReturnType<typeof useSharedPieceAssets>;

function AnimalPiece({
  view,
  template,
  shared,
  controller,
  selectableRef,
  onSelect,
  onHover,
}: {
  view: PieceVisual;
  template: AnimalTemplate;
  shared: Shared;
  controller: PresentationController;
  selectableRef: React.RefObject<ReadonlySet<PieceId>>;
  onSelect: (id: PieceId) => void;
  onHover: (id: PieceId | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const instance = useMemo(() => instantiateAnimal(template), [template]);
  const applied = useRef({ onceSeq: -1, onceActive: false, loopKey: '' });

  useEffect(() => {
    instance.controller.loop('idle', { fade: 0 });
    // De-synchronise idle cycles so sixteen animals don't breathe in unison.
    instance.controller.mixer.update(Math.random() * 3);
    return () => instance.controller.dispose();
  }, [instance]);

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.25) * controller.speed;
    g.position.copy(view.pos);
    g.rotation.y = view.yaw;
    g.scale.setScalar(view.scale * Math.max(0.001, view.opacity));
    g.visible = view.opacity > 0.02;

    const selectable = selectableRef.current?.has(view.id) ?? false;
    const once = view.anim.once;
    if (once && once.seq !== applied.current.onceSeq) {
      // One-shots (entry, land, attack, react…) take priority over loops.
      const seq = once.seq;
      applied.current.onceSeq = seq;
      applied.current.onceActive = true;
      void instance.controller
        .once(once.state, { clip: once.clip, timeScale: once.timeScale })
        .then(() => {
          if (applied.current.onceSeq === seq) {
            applied.current.onceActive = false;
            applied.current.loopKey = '';
          }
        });
    }
    // Base loop: movable animals look alert while waiting to be chosen.
    let loop: AnimState = view.anim.loop;
    if (selectable && loop === 'idle') loop = 'anticipation';
    const loopKey = `${loop}:${view.anim.loopClip ?? ''}:${view.anim.loopTimeScale}`;
    if (!applied.current.onceActive && loopKey !== applied.current.loopKey) {
      applied.current.loopKey = loopKey;
      instance.controller.loop(loop, {
        clip: view.anim.loopClip,
        timeScale: view.anim.loopTimeScale,
      });
    }
    instance.controller.update(dt);

    const ring = ringRef.current;
    if (ring) {
      ring.visible = selectable;
      if (selectable) {
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.06;
        ring.scale.setScalar(pulse);
      }
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (selectableRef.current?.has(view.id)) onSelect(view.id);
  };

  return (
    <group ref={group} name={view.id}>
      <mesh
        geometry={shared.base}
        material={shared.baseMaterials[view.seat]}
        castShadow
        receiveShadow
      />
      <mesh geometry={shared.rim} material={shared.gold} />
      <mesh ref={ringRef} geometry={shared.ring} material={shared.ringMaterial} visible={false} />
      <group position-y={BASE_HEIGHT}>
        <primitive object={instance.object} />
      </group>
      <mesh
        geometry={shared.hit}
        material={shared.hitMaterial}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (selectableRef.current?.has(view.id)) {
            document.body.style.cursor = 'pointer';
            onHover(view.id);
          }
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          onHover(null);
        }}
      />
    </group>
  );
}

export function Pieces({
  controller,
  templates,
  selectableRef,
  onSelect,
  onHover,
}: {
  controller: PresentationController;
  templates: Record<Species, AnimalTemplate>;
  selectableRef: React.RefObject<ReadonlySet<PieceId>>;
  onSelect: (id: PieceId) => void;
  onHover: (id: PieceId | null) => void;
}) {
  const shared = useSharedPieceAssets();
  const views = useMemo(() => [...controller.pieces.values()], [controller]);
  return (
    <group name="pieces">
      {views.map((view) => (
        <AnimalPiece
          key={view.id}
          view={view}
          template={templates[view.species]}
          shared={shared}
          controller={controller}
          selectableRef={selectableRef}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}
