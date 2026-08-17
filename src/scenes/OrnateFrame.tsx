/**
 * OrnateFrame — the compound moulding around a painting, in the style of the
 * museum it hangs in. Geometry is built and merged in frames.ts; this is the
 * component that mounts it and gives each material role its finish.
 *
 * Three draw calls: the gilt courses, the dark courses, and the bead course.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildFrame } from './frames';
import type { FrameKind } from '../types';

export function OrnateFrame({
  kind,
  width,
  height,
  gilt = '#C9A227',
  dark = '#2E241A',
  /** how far in front of the wall the frame's sight edge sits */
  z = 0,
}: {
  kind: FrameKind;
  width: number;
  height: number;
  gilt?: string;
  dark?: string;
  z?: number;
}) {
  const frame = useMemo(() => buildFrame(kind, width, height), [kind, width, height]);
  const beadRef = useRef<THREE.InstancedMesh>(null);

  useEffect(
    () => () => {
      frame.gilt?.dispose();
      frame.dark?.dispose();
    },
    [frame],
  );

  useLayoutEffect(() => {
    const mesh = beadRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    frame.beads.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [frame]);

  const beadColor = frame.beadRole === 'gilt' ? gilt : dark;

  return (
    <group position={[0, 0, z]}>
      {frame.gilt && (
        <mesh geometry={frame.gilt} castShadow receiveShadow>
          {/* Water-gilded moulding. Kept fairly rough on purpose: real gilding
              is burnished leaf over gesso and bole, so it glows unevenly and
              goes warm-brown in the hollows. Pushed any shinier under a
              gallery spotlight it flattens into a single sheet of plastic
              yellow with no relief at all. */}
          <meshStandardMaterial color={gilt} metalness={0.72} roughness={0.52} />
        </mesh>
      )}
      {frame.dark && (
        <mesh geometry={frame.dark} castShadow receiveShadow>
          {/* the cove between courses, in stained wood or bole */}
          <meshStandardMaterial color={dark} metalness={0.12} roughness={0.62} />
        </mesh>
      )}
      {frame.beads.length > 0 && (
        <instancedMesh
          ref={beadRef}
          args={[undefined, undefined, frame.beads.length]}
          castShadow
        >
          <sphereGeometry args={[frame.beadRadius, 8, 6]} />
          <meshStandardMaterial color={beadColor} metalness={0.85} roughness={0.3} />
        </instancedMesh>
      )}
    </group>
  );
}
