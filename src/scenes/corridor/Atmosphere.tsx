/**
 * The air in the room.
 *
 * A gallery photographed from the doorway is never a diagram of surfaces —
 * it is full of light you can see: shafts leaning down out of the skylights,
 * and dust turning slowly in them. Both are cheap and both do more for the
 * feeling of the space than any amount of extra moulding, because they are
 * what tells the eye the room has depth and air in it.
 *
 * Two pieces, driven by the museum's own key-light direction and lamp colour:
 *
 *   Shafts   additive quads leaning from each skylight bay down to the floor,
 *            slowly breathing so the light never looks printed on
 *   Motes    a few hundred instanced specks drifting upward and sideways,
 *            brightest where the shafts land
 *
 * Everything is additive, depth-tested but never depth-writing, and rendered
 * last — so it lies over the room without ever occluding a painting.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MuseumStyle } from '../../types';
import { bayZ, type Dims } from './dims';

interface Props {
  style: MuseumStyle;
  d: Dims;
  /** low tiers halve the mote count and drop the shafts to one per two bays */
  quality: 'high' | 'mid' | 'low';
}

const MOTES_BY_QUALITY = { high: 420, mid: 240, low: 0 } as const;

export function Atmosphere({ style, d, quality }: Props) {
  const shaftRef = useRef<THREE.InstancedMesh>(null);
  const moteRef = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);

  // the shafts lean the way the key light does
  const lean = useMemo(() => {
    const [kx, ky] = style.light.keyFrom;
    return Math.atan2(kx, Math.max(2, ky)) * 0.8;
  }, [style.light.keyFrom]);

  const step = quality === 'low' ? 2 : 1;
  const shaftCount = Math.max(1, Math.ceil(d.bays / step));
  const moteCount = MOTES_BY_QUALITY[quality];

  /** where each mote lives and how fast it drifts — fixed for the session */
  const motes = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; sp: number; ph: number; s: number }> = [];
    for (let i = 0; i < moteCount; i++) {
      list.push({
        x: (Math.random() - 0.5) * d.halfWidth * 1.9,
        y: Math.random() * (d.vaultHeight * 0.8),
        z: -Math.random() * (d.length + d.bayDepth),
        sp: 0.05 + Math.random() * 0.16,
        ph: Math.random() * Math.PI * 2,
        s: 0.5 + Math.random() * 1.1,
      });
    }
    return list;
  }, [moteCount, d.halfWidth, d.vaultHeight, d.length, d.bayDepth]);

  useLayoutEffect(() => {
    const mesh = shaftRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < shaftCount; i++) {
      m.makeRotationZ(lean);
      m.setPosition(-lean * d.vaultHeight * 0.4, d.vaultHeight * 0.42, bayZ(d, i * step));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [shaftCount, step, lean, d]);

  useFrame((_, delta) => {
    t.current += delta;

    // the shafts breathe: strength drifts a few percent, so light through a
    // skylight reads as weather rather than as a decal
    const mesh = shaftRef.current;
    if (mesh) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.032 + Math.sin(t.current * 0.22) * 0.009;
    }

    const dust = moteRef.current;
    if (!dust || !motes.length) return;
    const m = new THREE.Matrix4();
    const ceiling = d.vaultHeight * 0.86;
    for (let i = 0; i < motes.length; i++) {
      const p = motes[i];
      p.y += p.sp * delta;
      if (p.y > ceiling) p.y = 0.2;
      const sway = Math.sin(t.current * 0.4 + p.ph) * 0.22;
      const scale = p.s * (0.55 + 0.45 * Math.sin(t.current * 0.9 + p.ph));
      m.makeScale(scale, scale, scale);
      m.setPosition(p.x + sway, p.y, p.z + Math.cos(t.current * 0.3 + p.ph) * 0.18);
      dust.setMatrixAt(i, m);
    }
    dust.instanceMatrix.needsUpdate = true;
  });

  return (
    <group renderOrder={10}>
      <instancedMesh
        ref={shaftRef}
        args={[undefined, undefined, shaftCount]}
        frustumCulled={false}
      >
        <planeGeometry args={[d.halfWidth * 1.5, d.vaultHeight * 1.5]} />
        <meshBasicMaterial
          color={style.light.key}
          transparent
          opacity={0.032}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>

      {motes.length > 0 && (
        <instancedMesh
          ref={moteRef}
          args={[undefined, undefined, motes.length]}
          frustumCulled={false}
        >
          <sphereGeometry args={[0.012, 5, 4]} />
          <meshBasicMaterial
            color={style.light.lamp}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      )}
    </group>
  );
}
