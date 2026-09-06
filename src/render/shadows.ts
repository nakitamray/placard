/**
 * Shadow maps, drawn when something moves rather than sixty times a second.
 *
 * A shadow map is a third pass over the whole room's geometry, and three.js
 * runs it on every frame by default. Both rooms here have exactly one caster —
 * the key light in the corridor, the picture spot in the gallery — hung over
 * architecture that never moves. The map those lights produce is correct until
 * the light itself moves, which happens while the visitor is walking and at no
 * other time.
 *
 * So `gl.shadowMap.autoUpdate` is off (App sets it when the renderer is made)
 * and this is how a scene says the picture has changed. The bars of light on
 * the floor are identical; they are simply no longer recomputed for frames in
 * which nothing about them is different.
 */
import { useCallback } from 'react';
import { useThree } from '@react-three/fiber';

/** ask for one more shadow pass on the next frame */
export function useShadowRefresh(): () => void {
  const gl = useThree((s) => s.gl);
  return useCallback(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl]);
}
