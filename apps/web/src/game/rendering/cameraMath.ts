import * as THREE from 'three';

/** Fixed 3/4 isometric view: corner-on (45° azimuth) and ~48° down (spec: 45–55°). */
export const CAMERA_ELEVATION = THREE.MathUtils.degToRad(48);
export const CAMERA_FOV = 30;
export const ZOOM_RANGE: [number, number] = [0.78, 1.12];

const CORNERS = (() => {
  const pts: THREE.Vector3[] = [];
  const h = 8.45;
  for (const x of [-h, h])
    for (const z of [-h, h]) for (const y of [-0.6, 0.9]) pts.push(new THREE.Vector3(x, y, z));
  return pts;
})();

const tmp = new THREE.Vector3();

/** Smallest camera distance at which the whole board fits inside the margins. */
export function fitDistance(
  camera: THREE.PerspectiveCamera,
  azimuth: number,
  margin: { x: number; y: number },
): number {
  const dir = new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(CAMERA_ELEVATION),
    Math.sin(CAMERA_ELEVATION),
    Math.cos(azimuth) * Math.cos(CAMERA_ELEVATION),
  );
  let lo = 5;
  let hi = 200;
  for (let i = 0; i < 28; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(dir).multiplyScalar(d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const fits = CORNERS.every((c) => {
      tmp.copy(c).project(camera);
      return Math.abs(tmp.x) <= 1 - margin.x && Math.abs(tmp.y) <= 1 - margin.y;
    });
    if (fits) hi = d;
    else lo = d;
  }
  return hi;
}
