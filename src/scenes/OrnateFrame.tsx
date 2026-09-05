/**
 * OrnateFrame — the compound moulding around a painting, in the style of the
 * museum it hangs in. Geometry is built and merged in frames.ts; this is the
 * component that mounts it and gives each material role its finish.
 *
 * Three draw calls: the gilt courses, the dark courses, and the bead course.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildArchedFrame, buildDivider, buildFrame, buildRoundFrame } from './frames';
import type { FrameKind, FrameShape } from '../types';

export function OrnateFrame({
  kind,
  width,
  height,
  gilt = '#C9A227',
  dark = '#2E241A',
  /** how far in front of the wall the frame's sight edge sits */
  z = 0,
  /**
   * 'full' carves the frame; 'plain' keeps only the turned courses.
   *
   * The bead course is the expensive part — forty-odd spheres per frame, and
   * a salon wall carries sixty frames. Beads are invisible past a few metres
   * and cost tens of thousands of triangles, so anything small or distant
   * gets the mouldings without the carving.
   */
  detail = 'full',
  /**
   * 'round' turns the whole profile on a lathe, for a tondo; 'divided' keeps
   * the rectangle and runs a moulded bar down the middle, for a pair hung as
   * one object; 'arched' carries the same profile round a half circle at the
   * head, for a round-headed altarpiece panel. Omitted, the frame is the
   * museum's plain rectangle.
   */
  shape,
}: {
  kind: FrameKind;
  width: number;
  height: number;
  gilt?: string;
  dark?: string;
  z?: number;
  detail?: 'full' | 'plain';
  shape?: FrameShape;
}) {
  const frame = useMemo(
    () =>
      shape === 'round'
        ? buildRoundFrame(kind, Math.min(width, height), detail === 'full')
        : shape === 'arched'
          ? buildArchedFrame(kind, width, height, detail === 'full')
          : buildFrame(kind, width, height, detail === 'full'),
    [kind, width, height, detail, shape],
  );
  const divider = useMemo(
    () => (shape === 'divided' ? buildDivider(kind, height) : null),
    [shape, kind, height],
  );
  const dividerBeadRef = useRef<THREE.InstancedMesh>(null);
  const beadRef = useRef<THREE.InstancedMesh>(null);

  useEffect(
    () => () => {
      frame.gilt?.dispose();
      frame.dark?.dispose();
    },
    [frame],
  );
  useEffect(() => () => divider?.gilt.dispose(), [divider]);

  useLayoutEffect(() => {
    const mesh = dividerBeadRef.current;
    if (!mesh || !divider) return;
    const m = new THREE.Matrix4();
    divider.beads.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [divider]);

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
        >
          <sphereGeometry args={[frame.beadRadius, 6, 4]} />
          <meshStandardMaterial color={beadColor} metalness={0.85} roughness={0.3} />
        </instancedMesh>
      )}
      {divider && (
        <group>
          <mesh geometry={divider.gilt} castShadow receiveShadow>
            <meshStandardMaterial color={gilt} metalness={0.72} roughness={0.52} />
          </mesh>
          {detail === 'full' && divider.beads.length > 0 && (
            <instancedMesh
              ref={dividerBeadRef}
              args={[undefined, undefined, divider.beads.length]}
            >
              <sphereGeometry args={[divider.beadRadius, 6, 4]} />
              <meshStandardMaterial color={gilt} metalness={0.85} roughness={0.3} />
            </instancedMesh>
          )}
        </group>
      )}
    </group>
  );
}
