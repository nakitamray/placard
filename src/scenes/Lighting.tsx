/**
 * Shared lighting rig — spec §10A.5. The corridor must feel light, warm and
 * open (§10A.6 brightness guardrail): generous hemisphere fill, warm lamps,
 * ACES exposure 1.15 set on the renderer in App.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Procedural neutral studio environment — stands in for the Poly Haven HDRI
 *  (unreachable in this build environment); gives the gilt its reflections. */
export function Environment({ intensity = 0.45 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

export function HemisphereFill({ intensity = 0.4 }: { intensity?: number }) {
  return <hemisphereLight args={['#FFF3E0', '#C9BCA6', intensity]} />;
}

export const LAMP = '#FFE9C6'; // ~3000K
