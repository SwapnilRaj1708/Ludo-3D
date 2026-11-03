import type * as THREE from 'three';
import type { BuiltRig } from '../rig/rigKit';

export interface ProxyBuild {
  rig: BuiltRig;
  clips: THREE.AnimationClip[];
  /** Approximate nose-to-tail length in model units, used to normalise footprints. */
  footprintLength: number;
}
