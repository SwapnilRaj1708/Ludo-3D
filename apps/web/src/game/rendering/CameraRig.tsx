'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PresentationController } from '../animations/PresentationController';
import { BACKGROUND } from './SceneEnvironment';
import { CAMERA_ELEVATION, CAMERA_FOV, ZOOM_RANGE, fitDistance } from './cameraMath';

export { CAMERA_FOV };

export function CameraRig({
  azimuth,
  controller,
  reducedMotion,
}: {
  azimuth: number;
  controller: PresentationController;
  reducedMotion: boolean;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const zoom = useRef(1);
  const zoomTarget = useRef(1);
  const currentAzimuth = useRef(azimuth);

  const portrait = size.height > size.width;
  const margin = useMemo(() => (portrait ? { x: 0.03, y: 0.3 } : { x: 0.2, y: 0.07 }), [portrait]);
  const baseDistance = useMemo(() => {
    camera.fov = CAMERA_FOV;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.near = 0.5;
    camera.far = 200;
    camera.updateProjectionMatrix();
    return fitDistance(camera, azimuth, margin);
  }, [camera, size.width, size.height, azimuth, margin]);

  // Fog only swallows the far edge of the table, never the board itself.
  useEffect(() => {
    scene.fog = new THREE.Fog(BACKGROUND, baseDistance + 14, baseDistance + 70);
    return () => {
      scene.fog = null;
    };
  }, [scene, baseDistance]);

  // Mouse-wheel and two-finger pinch zoom, clamped to a small range.
  useEffect(() => {
    const el = gl.domElement;
    const clamp = (z: number) => Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], z));
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTarget.current = clamp(zoomTarget.current * (1 + Math.sign(e.deltaY) * 0.06));
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let zoomStart = 1;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinchStart = spread();
        zoomStart = zoomTarget.current;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart > 0) {
        zoomTarget.current = clamp(zoomStart * (pinchStart / Math.max(1, spread())));
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    const onZoomEvent = (e: Event) => {
      const delta = (e as CustomEvent<number>).detail;
      zoomTarget.current = clamp(zoomTarget.current * delta);
    };
    window.addEventListener('ludo3d:zoom', onZoomEvent);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      window.removeEventListener('ludo3d:zoom', onZoomEvent);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * (reducedMotion ? 30 : 6));
    zoom.current += (zoomTarget.current - zoom.current) * k;
    let da = azimuth - currentAzimuth.current;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    currentAzimuth.current += da * k;
    const d = baseDistance * zoom.current;
    const a = currentAzimuth.current;
    camera.position.set(
      Math.sin(a) * Math.cos(CAMERA_ELEVATION) * d,
      Math.sin(CAMERA_ELEVATION) * d,
      Math.cos(a) * Math.cos(CAMERA_ELEVATION) * d,
    );
    const shake = reducedMotion ? 0 : controller.shake;
    const t = performance.now() / 1000;
    camera.lookAt(
      Math.sin(t * 47) * shake * 0.25,
      Math.sin(t * 61) * shake * 0.15,
      Math.cos(t * 53) * shake * 0.25,
    );
  });

  return null;
}
