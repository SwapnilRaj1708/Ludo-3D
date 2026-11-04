'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
}

/**
 * E2E/diagnostic builds only: publishes renderer statistics on
 * `window.__LUDO_PERF__` once per second for automated performance checks.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, elapsed: 0 });
  useFrame((_, dt) => {
    acc.current.frames++;
    acc.current.elapsed += dt;
    if (acc.current.elapsed < 1) return;
    const fps = acc.current.frames / acc.current.elapsed;
    const info = gl.info;
    const snapshot: PerfSnapshot = {
      fps: Math.round(fps * 10) / 10,
      frameMs: Math.round((1000 / fps) * 10) / 10,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
    };
    (window as unknown as { __LUDO_PERF__?: PerfSnapshot }).__LUDO_PERF__ = snapshot;
    acc.current = { frames: 0, elapsed: 0 };
  });
  return null;
}
