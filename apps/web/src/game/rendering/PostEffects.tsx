'use client';

import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * High-quality post-processing: a restrained bloom on bright highlights (gold
 * trim, dice pips, capture sparks) and a soft vignette that frames the board.
 *
 * The composer disables the renderer's own tone mapping while it is active,
 * so tone mapping (AgX, matching the other profiles) runs here as an effect,
 * followed by SMAA on the display-referred image. MSAA is off in the composer;
 * SMAA is cheaper at comparable quality for this scene.
 *
 * Screen-space ambient occlusion was evaluated and left out: n8ao 2.0.1 is not
 * compatible with three r187 render targets, and the shadow maps on this
 * profile already ground the pieces (see docs/DECISIONS.md).
 *
 * Loaded lazily: Low and Medium never download this code.
 */
export default function PostEffects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.22} luminanceThreshold={0.92} luminanceSmoothing={0.15} />
      <Vignette offset={0.3} darkness={0.42} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
    </EffectComposer>
  );
}
