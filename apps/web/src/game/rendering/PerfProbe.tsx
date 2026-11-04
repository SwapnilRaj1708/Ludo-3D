'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  /** Draw calls and triangles of one whole frame (all post-processing passes). */
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
 *
 * The renderer normally resets its counters on every `render()` call, which
 * under post-processing would report only the last pass. The probe turns that
 * off and resets once per frame instead, before anything renders, reading the
 * previous frame's totals first.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, elapsed: 0 });

  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previous;
    };
  }, [gl]);

  useFrame((_, dt) => {
    const info = gl.info;
    const calls = info.render.calls;
    const triangles = info.render.triangles;
    info.reset();
    acc.current.frames++;
    acc.current.elapsed += dt;
    if (acc.current.elapsed < 1) return;
    const fps = acc.current.frames / acc.current.elapsed;
    const snapshot: PerfSnapshot = {
      fps: Math.round(fps * 10) / 10,
      frameMs: Math.round((1000 / fps) * 10) / 10,
      calls,
      triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
    };
    (window as unknown as { __LUDO_PERF__?: PerfSnapshot }).__LUDO_PERF__ = snapshot;
    acc.current = { frames: 0, elapsed: 0 };
  }, -100);
  return null;
}
