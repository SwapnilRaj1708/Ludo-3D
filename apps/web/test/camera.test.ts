import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_ELEVATION, CAMERA_FOV, fitDistance } from '../src/game/rendering/cameraMath';
import { cornerAzimuth } from '../src/game/rendering/coords';

describe('camera framing', () => {
  it.each([
    ['phone portrait', 390, 844, { x: 0.03, y: 0.3 }],
    ['phone landscape', 844, 390, { x: 0.2, y: 0.07 }],
    ['desktop', 1440, 900, { x: 0.2, y: 0.07 }],
  ])('keeps every board corner on screen (%s)', (_name, w, h, margin) => {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, w / h, 0.5, 200);
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      const azimuth = cornerAzimuth(corner);
      const d = fitDistance(camera, azimuth, margin);
      expect(d).toBeGreaterThan(5);
      camera.position.set(
        Math.sin(azimuth) * Math.cos(CAMERA_ELEVATION) * d,
        Math.sin(CAMERA_ELEVATION) * d,
        Math.cos(azimuth) * Math.cos(CAMERA_ELEVATION) * d,
      );
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      for (const x of [-8.45, 8.45]) {
        for (const z of [-8.45, 8.45]) {
          const p = new THREE.Vector3(x, 0, z).project(camera);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('uses a 3/4 view within the 45–55° elevation band', () => {
    const deg = THREE.MathUtils.radToDeg(CAMERA_ELEVATION);
    expect(deg).toBeGreaterThanOrEqual(45);
    expect(deg).toBeLessThanOrEqual(55);
  });
});
