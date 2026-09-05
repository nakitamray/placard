/**
 * What stands on the floor and hangs from the ceiling.
 *
 * Furniture is what stops a corridor reading as a rendering: the benches,
 * plinths, chandeliers and label stands are how you know the space is meant to
 * be walked through by people. Each museum's style record picks its own set.
 *
 * FIGURES ARE OFF.
 *   The plinths still stand where the sculpture goes, and the sculpture itself
 *   is not drawn. `Figure` and `Bust` below are abstracted marble forms built
 *   for their silhouette, and they were the weakest thing in every room —
 *   close enough to read as a statue at the end of a corridor and wrong from
 *   any distance a visitor actually stops at. An empty plinth is honest and
 *   reads as a gallery mid-rehang; a poor statue reads as a mistake.
 *
 *   Both functions are kept, and the call sites are commented rather than
 *   deleted, because what replaces them is a scanned model dropped into the
 *   same three places — see "Known limits" in the README.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { corridor } from '../../state/motion';
import { useStore } from '../../state/store';
import type { MuseumStyle } from '../../types';
import { bayZ, hangTop, type Dims } from './dims';

interface Props {
  style: MuseumStyle;
  d: Dims;
}

/**
 * Anything repeated down a corridor is one draw call.
 *
 * `place` is given the index and a matrix to fill; the children are the
 * geometry and material every instance shares.
 */
function Instanced({
  count,
  place,
  children,
}: {
  count: number;
  place: (i: number, m: THREE.Matrix4) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      place(i, m);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, place]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
      {children}
    </instancedMesh>
  );
}


/**
 * Marble, not plastic.
 *
 * A bright flat diffuse at 0.44 roughness is a plastic toy under gallery
 * lighting: the highlight is a broad dull smear and the shadowed side goes
 * dead. Real statuary marble is slightly warm, noticeably glossier than that,
 * and — the thing that actually gives it away — it carries light *into* the
 * surface, so the shadowed side of a limb never goes as dark as its geometry
 * says it should. The environment map does the second job here; a lower
 * roughness and a high environment intensity do the first.
 */
const MARBLE = '#EDE7DA';

/**
 * An abstracted classical figure. Real museum sculpture is scanned, and the
 * CC0 scan libraries are not reachable from this build — so these are honest
 * abstractions: a mass, a torso, a head, drapery, at the right scale and with
 * the right silhouette at corridor distance.
 */
const marble = (rough = 0.34) => (
  <meshStandardMaterial
    color={MARBLE}
    roughness={rough}
    metalness={0}
    envMapIntensity={1.5}
  />
);

/**
 * A limb.
 *
 * Capsules, but rounder than they were — a five-segment cap on a thigh is a
 * visible faceted dome from three metres, and these are the closest things in
 * the room to the camera after the frames. `taper` narrows the far end, which
 * is what stops an arm reading as a length of pipe: every limb on a body is
 * thicker at the joint it hangs from than at the one it ends in.
 */
function Limb({
  p,
  r,
  len,
  rot,
  rough = 0.34,
  taper = 1,
}: {
  p: [number, number, number];
  r: number;
  len: number;
  rot?: [number, number, number];
  rough?: number;
  /** radius multiplier at the lower end */
  taper?: number;
}) {
  return (
    <group position={p} rotation={rot}>
      <mesh castShadow scale={[1, 1, 1]}>
        <capsuleGeometry args={[r, len, 8, 18]} />
        {marble(rough)}
      </mesh>
      {taper !== 1 && (
        // a second, narrower capsule sunk into the lower half does the taper
        // without needing a lathe for every limb in the room
        <mesh position={[0, -len * 0.3, 0]} castShadow>
          <capsuleGeometry args={[r * taper, len * 0.5, 8, 16]} />
          {marble(rough)}
        </mesh>
      )}
    </group>
  );
}

/**
 * The head.
 *
 * A sphere is a ball on a stick. A skull is longer than it is wide, flat at
 * the temples, heavier at the back than the front, and carries a mass of
 * carved hair that is bigger than the cranium under it — and it sits forward
 * of the neck, not on top of it. All four of those are silhouette facts, and
 * silhouette is all you get at gallery distance.
 */
function Head({ p, r = 0.115, turn = 0 }: { p: [number, number, number]; r?: number; turn?: number }) {
  return (
    <group position={p} rotation={[0, turn, 0]}>
      {/* cranium: longer front-to-back than side-to-side, narrow at the temples */}
      <mesh scale={[0.9, 1.06, 1.04]} castShadow>
        <sphereGeometry args={[r, 24, 18]} />
        {marble(0.3)}
      </mesh>
      {/* the jaw and chin, forward and below */}
      <mesh position={[0, -r * 0.5, r * 0.16]} scale={[0.72, 0.62, 0.8]} castShadow>
        <sphereGeometry args={[r, 18, 14]} />
        {marble(0.32)}
      </mesh>
      {/* the nose — one of the two things that make a marble head read as a
          face in silhouette; the other is the hair behind it */}
      <mesh position={[0, -r * 0.1, r * 0.86]} rotation={[0.5, 0, 0]} castShadow>
        <coneGeometry args={[r * 0.2, r * 0.5, 8]} />
        {marble(0.3)}
      </mesh>
      {/* carved hair: a bigger, rougher mass sitting back off the brow */}
      <mesh position={[0, r * 0.34, -r * 0.3]} scale={[1.2, 0.98, 1.16]} castShadow>
        <sphereGeometry args={[r, 20, 16]} />
        {marble(0.62)}
      </mesh>
    </group>
  );
}

/**
 * The torso, turned as one piece.
 *
 * Three spheres for pelvis, ribcage and shoulders is a snowman: at gallery
 * distance the eye reads the gaps between them, not the body they are meant
 * to add up to. A body is one continuous surface that swells at the hips,
 * pulls in hard at the waist and opens out again across the chest, and the
 * only way to get that is to give the profile to a lathe and turn it.
 *
 * Squashed in Z, because a person is a good deal wider than they are deep and
 * a turned solid is neither until you say so.
 */
function Torso({
  h = 0.46,
  r = 0.17,
  depth = 0.62,
  lean = 0,
}: {
  h?: number;
  r?: number;
  depth?: number;
  lean?: number;
}) {
  const profile = useMemo(() => {
    // [height fraction, radius fraction] from the hips up to the neck
    const shape: Array<[number, number]> = [
      [0, 0.6],
      [0.12, 0.68],
      [0.34, 0.5],
      [0.55, 0.62],
      [0.76, 0.7],
      [0.9, 0.66],
      [1, 0.4],
    ];
    return shape.map(([t, w]) => new THREE.Vector2(r * w, t * h));
  }, [h, r]);
  return (
    <mesh rotation={[lean, 0, 0]} scale={[1, 1, depth]} castShadow receiveShadow>
      <latheGeometry args={[profile, 28]} />
      {marble(0.32)}
    </mesh>
  );
}

/**
 * Drapery, as a lathe rather than a stack of capsules.
 *
 * A profile turned about the vertical is exactly how a draped standing figure
 * reads from any angle in a gallery: a column that swells at the hips, pulls
 * in at the waist, and flares to the floor. The vertical folds are added on
 * top as narrow capsules, which is what breaks the turned silhouette and
 * stops it looking like a vase.
 */
function Drapery({ h = 0.9, r = 0.26 }: { h?: number; r?: number }) {
  const profile = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    // y from the hem up to the waist, as a fraction of h
    const shape: Array<[number, number]> = [
      [0, 1.0],
      [0.12, 0.94],
      [0.3, 0.86],
      [0.5, 0.8],
      [0.7, 0.76],
      [0.86, 0.72],
      [1, 0.66],
    ];
    for (const [t, w] of shape) pts.push(new THREE.Vector2(r * w, t * h));
    return pts;
  }, [h, r]);
  return (
    <mesh castShadow receiveShadow>
      <latheGeometry args={[profile, 26]} />
      {marble(0.5)}
    </mesh>
  );
}

/**
 * Four classical types, distributed around the exhibition.
 *
 * Real museum sculpture is scanned and the CC0 scan libraries are unreachable
 * from this build, so these are honest abstractions — but a single capsule on
 * a plinth reads as a bollard, not as a statue. What makes a figure legible
 * down a gallery is the silhouette: two legs with a gap between them, a
 * weight-bearing hip, an arm that leaves the body, and a head that sits
 * forward of the shoulders. Each type below is built for that outline.
 *
 *   0  draped standing female — the peplophoros, a column of drapery
 *   1  contrapposto male nude — weight on one leg, the Doryphoros type
 *   2  seated philosopher — knees forward, leaning on one arm
 *   3  orator with a raised arm — the one dynamic silhouette in the set
 */
function Figure({ seed, scale = 1 }: { seed: number; scale?: number }) {
  const variant = Math.abs(Math.round(seed)) % 4;
  const turn = (seed * 1.7) % Math.PI;

  return (
    <group rotation={[0, turn, 0]} scale={scale}>
      {/* the round plinth block every type stands on */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.1, 24]} />
        {marble(0.55)}
      </mesh>

      {variant === 0 && (
        /* the peplophoros: a column of drapery with a body inside it */
        <group>
          <group position={[0, 0.1, 0]}>
            <Drapery h={0.88} r={0.27} />
          </group>
          {/* the folds that break the turned silhouette */}
          {[-0.14, -0.05, 0.05, 0.15].map((x, i) => (
            <Limb
              key={i}
              p={[x, 0.55, 0.14 + Math.abs(x) * -0.2]}
              r={0.028}
              len={0.66}
              rough={0.66}
            />
          ))}
          {/* the shawl over the shoulders, and the mass of the torso above it */}
          <mesh position={[0, 1.03, 0]} scale={[1, 1.2, 0.72]} castShadow>
            <sphereGeometry args={[0.155, 20, 16]} />
            {marble(0.4)}
          </mesh>
          <mesh position={[0, 1.11, -0.01]} scale={[1.5, 0.44, 0.95]} castShadow>
            <sphereGeometry args={[0.15, 20, 14]} />
            {marble(0.5)}
          </mesh>
          {/* one arm down inside the drapery, one folded across the waist */}
          <Limb p={[-0.19, 0.96, 0.02]} r={0.048} len={0.34} rot={[0, 0, 0.09]} taper={0.78} />
          <Limb p={[0.16, 0.99, 0.11]} r={0.048} len={0.26} rot={[0.35, 0, -0.55]} taper={0.78} />
          <Limb p={[0.02, 0.9, 0.17]} r={0.036} len={0.16} rot={[0.2, 0, -1.2]} taper={0.8} />
          {/* neck, then head */}
          <mesh position={[0, 1.21, 0.005]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 0.09, 14]} />
            {marble(0.34)}
          </mesh>
          <Head p={[0, 1.31, 0.02]} r={0.096} turn={0.2} />
        </group>
      )}

      {variant === 1 && (
        /* contrapposto male nude — the weight is the whole point of the type */
        <group>
          {/* weight leg: straight, under the shifted hip */}
          <Limb p={[-0.075, 0.34, 0]} r={0.068} len={0.4} taper={0.66} />
          <mesh position={[-0.08, 0.085, 0.035]} scale={[1, 0.55, 1.8]} castShadow>
            <sphereGeometry args={[0.058, 14, 10]} />
            {marble(0.4)}
          </mesh>
          {/* free leg: bent, trailing, and carrying nothing */}
          <Limb p={[0.095, 0.38, -0.03]} r={0.062} len={0.28} rot={[0.1, 0, -0.11]} taper={0.7} />
          <Limb p={[0.125, 0.16, -0.09]} r={0.046} len={0.2} rot={[-0.25, 0, -0.05]} taper={0.72} />
          <mesh position={[0.14, 0.05, -0.03]} scale={[1, 0.55, 1.7]} castShadow>
            <sphereGeometry args={[0.054, 14, 10]} />
            {marble(0.4)}
          </mesh>
          {/* one body from hips to neck, tipped over the weight leg */}
          <group position={[-0.03, 0.6, 0]} rotation={[0, 0, 0.05]}>
            <Torso h={0.47} r={0.165} />
          </group>
          {/* the shoulder line, counter-tipped against the hips */}
          <mesh position={[0.005, 1.03, 0]} rotation={[0, 0, 0.12]} scale={[1.62, 0.38, 0.82]} castShadow>
            <sphereGeometry args={[0.14, 22, 14]} />
            {marble(0.33)}
          </mesh>
          {/* arms: upper, fore, hand — one hanging, one bent across */}
          <Limb p={[-0.215, 0.93, 0.01]} r={0.043} len={0.22} rot={[0, 0, 0.13]} taper={0.8} />
          <Limb p={[-0.232, 0.73, 0.03]} r={0.035} len={0.2} rot={[0.1, 0, 0.05]} taper={0.78} />
          <mesh position={[-0.238, 0.605, 0.045]} scale={[0.8, 1.3, 0.5]} castShadow>
            <sphereGeometry args={[0.038, 12, 10]} />
            {marble(0.36)}
          </mesh>
          <Limb p={[0.222, 0.94, 0.02]} r={0.043} len={0.2} rot={[0, 0, -0.17]} taper={0.8} />
          <Limb p={[0.246, 0.79, 0.13]} r={0.035} len={0.19} rot={[0.75, 0, -0.1]} taper={0.78} />
          {/* neck and head, forward of the shoulders */}
          <mesh position={[0.012, 1.11, 0.014]} rotation={[0.07, 0, 0]} castShadow>
            <cylinderGeometry args={[0.038, 0.05, 0.1, 14]} />
            {marble(0.32)}
          </mesh>
          <Head p={[0.018, 1.21, 0.032]} r={0.093} turn={-0.3} />
        </group>
      )}

      {variant === 2 && (
        /* the seated philosopher, knees forward, drapery over the lap */
        <group>
          <mesh position={[0, 0.28, -0.09]} castShadow receiveShadow>
            <boxGeometry args={[0.46, 0.36, 0.4]} />
            {marble(0.6)}
          </mesh>
          {/* thighs forward, shins down, feet on the ground */}
          <Limb p={[-0.11, 0.5, 0.12]} r={0.075} len={0.28} rot={[1.42, 0, 0]} taper={0.8} />
          <Limb p={[0.11, 0.5, 0.14]} r={0.075} len={0.3} rot={[1.3, 0, 0]} taper={0.8} />
          <Limb p={[-0.11, 0.24, 0.28]} r={0.056} len={0.28} taper={0.72} />
          <Limb p={[0.11, 0.24, 0.3]} r={0.056} len={0.26} taper={0.72} />
          {[-0.11, 0.11].map((x, i) => (
            <mesh key={i} position={[x, 0.055, 0.34]} scale={[1, 0.55, 1.7]} castShadow>
              <sphereGeometry args={[0.058, 14, 10]} />
              {marble(0.4)}
            </mesh>
          ))}
          {/* the mass of cloth across the knees */}
          <mesh position={[0, 0.62, 0.17]} rotation={[1.35, 0, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.23, 0.36, 20]} />
            {marble(0.6)}
          </mesh>
          {/* torso leaning back, shoulders, neck */}
          <group position={[0, 0.6, -0.01]}>
            <Torso h={0.44} r={0.16} lean={-0.16} />
          </group>
          <mesh position={[0, 0.99, -0.045]} rotation={[-0.12, 0, 0]} scale={[1.55, 0.45, 0.88]} castShadow>
            <sphereGeometry args={[0.135, 20, 14]} />
            {marble(0.34)}
          </mesh>
          <mesh position={[0, 1.08, -0.03]} rotation={[0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.052, 0.09, 14]} />
            {marble(0.32)}
          </mesh>
          {/* one arm propping on the seat, one resting on the knee */}
          <Limb p={[-0.24, 0.82, -0.07]} r={0.045} len={0.2} rot={[0, 0, 0.2]} taper={0.8} />
          <Limb p={[-0.27, 0.6, -0.06]} r={0.038} len={0.22} taper={0.78} />
          <Limb p={[0.2, 0.83, 0.06]} r={0.045} len={0.2} rot={[0.5, 0, -0.2]} taper={0.8} />
          <Limb p={[0.22, 0.66, 0.22]} r={0.038} len={0.2} rot={[1.2, 0, -0.05]} taper={0.78} />
          <Head p={[0, 1.17, 0.02]} r={0.092} turn={0.35} />
        </group>
      )}

      {variant === 3 && (
        /* the orator — the one dynamic silhouette in the set */
        <group>
          <Limb p={[-0.085, 0.33, 0.02]} r={0.066} len={0.38} rot={[0, 0, 0.06]} taper={0.68} />
          <Limb p={[0.11, 0.34, -0.1]} r={0.062} len={0.28} rot={[-0.26, 0, -0.15]} taper={0.7} />
          <Limb p={[0.15, 0.14, -0.2]} r={0.046} len={0.18} rot={[-0.12, 0, -0.06]} taper={0.72} />
          {[[-0.09, 0.06], [0.16, -0.24]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.05, z]} scale={[1, 0.55, 1.7]} castShadow>
              <sphereGeometry args={[0.054, 14, 10]} />
              {marble(0.4)}
            </mesh>
          ))}
          {/* the body, turned toward the raised arm */}
          <group position={[-0.02, 0.58, 0]} rotation={[0, 0.3, -0.03]}>
            <Torso h={0.48} r={0.168} />
          </group>
          <mesh position={[0, 1.03, 0]} rotation={[0, 0.3, -0.09]} scale={[1.62, 0.38, 0.84]} castShadow>
            <sphereGeometry args={[0.14, 22, 14]} />
            {marble(0.33)}
          </mesh>
          {/* the raised arm: upper out, forearm up, hand open */}
          <Limb p={[-0.225, 1.04, 0.03]} r={0.042} len={0.2} rot={[0, 0, 0.95]} taper={0.82} />
          <Limb p={[-0.35, 1.23, 0.05]} r={0.037} len={0.21} rot={[0, 0, 0.3]} taper={0.8} />
          <mesh position={[-0.4, 1.36, 0.06]} scale={[0.9, 1.2, 0.55]} castShadow>
            <sphereGeometry args={[0.041, 12, 10]} />
            {marble(0.36)}
          </mesh>
          {/* the other holds a fold of cloak that falls behind the figure */}
          <Limb p={[0.215, 0.92, 0.03]} r={0.042} len={0.22} rot={[0, 0, -0.11]} taper={0.8} />
          <Limb p={[0.24, 0.71, 0.06]} r={0.035} len={0.19} rot={[0.2, 0, -0.05]} taper={0.78} />
          <mesh position={[0.285, 0.72, -0.08]} rotation={[0.1, 0, -0.22]} scale={[0.85, 1, 0.42]} castShadow>
            <capsuleGeometry args={[0.1, 0.58, 8, 16]} />
            {marble(0.62)}
          </mesh>
          <mesh position={[0.008, 1.11, 0.014]} rotation={[0.05, 0, 0]} castShadow>
            <cylinderGeometry args={[0.038, 0.05, 0.1, 14]} />
            {marble(0.32)}
          </mesh>
          <Head p={[0.012, 1.21, 0.036]} r={0.093} turn={-0.5} />
        </group>
      )}
    </group>
  );
}

/**
 * Roman portrait bust.
 *
 * Stacking two spheres of similar size makes a snowman, not a bust. What
 * reads is the cut: a Roman bust is a wide, square-shouldered mass that stops
 * abruptly at the chest, a distinctly narrower neck, and a head noticeably
 * smaller than the shoulders.
 */
function Bust({ seed }: { seed: number }) {
  const variant = Math.abs(Math.round(seed)) % 4;
  return (
    <group rotation={[0, (seed * 2.3) % Math.PI, 0]}>
      {/* the socle the bust is cut off onto */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.12, 12]} />
        {marble(0.55)}
      </mesh>
      {/* chest — wide, shallow, and squared off at the bottom */}
      <mesh position={[0, 0.26, 0]} scale={[1, 1, 0.62]} castShadow>
        <cylinderGeometry args={[0.23, 0.13, 0.3, 16]} />
        {marble(0.48)}
      </mesh>
      {/* shoulders */}
      <mesh position={[0, 0.4, 0]} scale={[1.5, 0.5, 0.85]} castShadow>
        <sphereGeometry args={[0.16, 16, 12]} />
        {marble(0.46)}
      </mesh>
      {/* toga over one shoulder on half of them */}
      {variant % 2 === 0 && (
        <mesh position={[0.13, 0.34, 0.06]} rotation={[0, 0, -0.6]} castShadow>
          <capsuleGeometry args={[0.05, 0.18, 4, 8]} />
          {marble(0.6)}
        </mesh>
      )}
      {/* neck, clearly narrower than both */}
      <mesh position={[0, 0.5, 0.01]} castShadow>
        <cylinderGeometry args={[0.052, 0.062, 0.1, 10]} />
        {marble(0.44)}
      </mesh>
      {/* head — smaller than the shoulders, turned a little off axis */}
      <group position={[0, 0.62, 0.01]} rotation={[0, variant > 1 ? 0.3 : -0.22, 0]}>
        <mesh scale={[0.86, 1, 0.92]} castShadow>
          <sphereGeometry args={[0.098, 16, 12]} />
          {marble(0.42)}
        </mesh>
        {/* the mass of hair and beard that gives a bust its silhouette */}
        <mesh position={[0, 0.036, -0.026]} scale={[1.1, 0.8, 1.05]} castShadow>
          <sphereGeometry args={[0.098, 14, 10]} />
          {marble(0.56)}
        </mesh>
        {variant === 3 && (
          <mesh position={[0, -0.05, 0.03]} scale={[0.9, 0.72, 0.8]} castShadow>
            <sphereGeometry args={[0.075, 12, 10]} />
            {marble(0.58)}
          </mesh>
        )}
      </group>
    </group>
  );
}

function Plinth({ h, w, color }: { h: number; w: number; color: string }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, h + 0.02, 0]} castShadow>
        <boxGeometry args={[w * 1.18, 0.04, w * 1.18]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Low bench, the kind that sits down the middle of a painting gallery.
 *
 * Read as a black hole in the floor at the old value: a near-black diffuse
 * surface under a dim room returns almost nothing, so a bench close to the
 * camera came out as a flat void rather than as furniture. Waxed dark oak
 * with some sheen catches the lamps and reads as an object.
 */
function Bench({ length }: { length: number }) {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.1, length]} />
        <meshStandardMaterial color="#54443A" roughness={0.38} metalness={0.05} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.19, (s * length) / 3]} castShadow>
          <boxGeometry args={[0.5, 0.36, 0.12]} />
          <meshStandardMaterial color="#42342C" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** round tufted leather seating — the National Gallery's centre-of-room sofa */
function Ottoman() {
  return (
    <group>
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.05, 0.36, 24]} />
        <meshStandardMaterial color="#4A2A20" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.56, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.42, 0.42, 18]} />
        <meshStandardMaterial color="#3E241B" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.18, 20]} />
        <meshStandardMaterial color="#241814" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** crystal chandelier: a ring of drops with a warm source inside */
function Chandelier({ lamp }: { lamp: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 18;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      const ring = i < 10 ? 0 : 1;
      const n = ring === 0 ? 10 : 8;
      const k = ring === 0 ? i : i - 10;
      const a = (k / n) * Math.PI * 2;
      const r = ring === 0 ? 0.4 : 0.24;
      m.makeTranslation(Math.cos(a) * r, ring === 0 ? -0.12 : -0.34, Math.sin(a) * r);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <group>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 6]} />
        <meshStandardMaterial color="#8A7434" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial
          color={lamp}
          emissive={lamp}
          emissiveIntensity={0.7}
          roughness={0.3}
        />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshStandardMaterial
          color="#F4EEDC"
          metalness={0.35}
          roughness={0.12}
          emissive={lamp}
          emissiveIntensity={0.22}
        />
      </instancedMesh>
    </group>
  );
}

/** the angled label stand beside a work */
function Placard() {
  return (
    <group>
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.88, 6]} />
        <meshStandardMaterial color="#2A2622" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.9, 0.05]} rotation={[-1.05, 0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.24, 0.015]} />
        <meshStandardMaterial color="#EFE8DA" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.04, 12]} />
        <meshStandardMaterial color="#2A2622" roughness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Orsay's great clock. It closes the corridor, so it is the thing you walk
 * toward for the whole length of the nave — the terminal magnet the transition
 * to the floor plan fires on.
 *
 * Every other museum ends in a canvas you can click to go straight there. This
 * one ends in a clock, and a clock is not a work, so clicking it does the
 * other thing the end of a corridor is for: it walks you down the rest of the
 * nave. `corridor.goal` is the damped scroll target, so setting it to the end
 * is a walk rather than a jump, and arriving fires the floor plan exactly as
 * walking there by hand does.
 */
function GreatClock({ style, y, z }: { style: MuseumStyle; y: number; z: number }) {
  const p = style.palette;
  const R = 2.4;
  const setHovered = useStore((s) => s.setHoveredWork);
  const ticks = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ticks.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      m.makeRotationZ(a);
      m.setPosition(Math.sin(a) * R * 0.78, Math.cos(a) * R * 0.78, 0.06);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  const walkToTheEnd = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (useStore.getState().phase !== 'corridor') return;
    document.body.style.cursor = '';
    setHovered(null);
    corridor.goal = 1;
  };

  return (
    <group position={[0, y, z]}>
      {/* the clock is the way out of the nave: one target over the whole face */}
      <mesh
        position={[0, 0, 0.14]}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          setHovered({ index: -1, artist: "Musée d'Orsay", title: 'The great clock' });
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          setHovered(null);
        }}
        onClick={walkToTheEnd}
      >
        <circleGeometry args={[R * 1.28, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* glazed face — daylight comes through the clock from outside */}
      <mesh>
        <circleGeometry args={[R * 0.86, 48]} />
        <meshBasicMaterial color={p.sky} toneMapped={false} />
      </mesh>
      {/* gilded surround, heavily ornamented */}
      <mesh position={[0, 0, 0.03]} castShadow>
        <torusGeometry args={[R * 0.9, 0.16, 10, 48]} />
        <meshStandardMaterial color={p.gilt} metalness={0.82} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <torusGeometry args={[R * 1.12, 0.3, 10, 48]} />
        <meshStandardMaterial color={p.gilt} metalness={0.7} roughness={0.4} />
      </mesh>
      {/* radiating ornament between the two rings */}
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[R * 1.28, 48]} />
        <meshStandardMaterial color={p.molding} roughness={0.75} />
      </mesh>
      <instancedMesh ref={ticks} args={[undefined, undefined, 12]}>
        <boxGeometry args={[0.09, 0.3, 0.06]} />
        <meshStandardMaterial color={p.gilt} metalness={0.8} roughness={0.3} />
      </instancedMesh>
      {/* hands, stopped — a museum clock in a station that stopped being one */}
      <mesh position={[0, R * 0.2, 0.08]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.07, R * 0.62, 0.03]} />
        <meshStandardMaterial color="#2A241C" roughness={0.6} />
      </mesh>
      <mesh position={[R * 0.14, R * 0.1, 0.08]} rotation={[0, 0, -1.1]}>
        <boxGeometry args={[0.06, R * 0.42, 0.03]} />
        <meshStandardMaterial color="#2A241C" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Orsay's raised side galleries behind glass railings */
function Terraces({ style, d }: Props) {
  const p = style.palette;
  const mid = -d.length / 2;
  const run = d.length + d.bayDepth * 3;
  // Above the pictures, always. A deck cantilevered 1.9m off the wall is the
  // heaviest thing in the room, and at its old fixed height of 3.1 it ran
  // straight through the top of every canvas in the nave.
  const deck = Math.max(3.1, hangTop(d, style) + 0.2);
  const inset = d.halfWidth - 1.9;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (d.halfWidth - 0.95), deck, mid]} receiveShadow>
            <boxGeometry args={[1.9, 0.22, run]} />
            <meshStandardMaterial color={p.molding} roughness={0.82} />
          </mesh>
          {/* glass railing — the modern insertion into the 1900 shell */}
          <mesh position={[side * inset, deck + 0.62, mid]}>
            <boxGeometry args={[0.04, 1.1, run]} />
            <meshStandardMaterial
              color="#CFE0EC"
              transparent
              opacity={0.24}
              roughness={0.1}
              metalness={0.2}
            />
          </mesh>
          <mesh position={[side * inset, deck + 1.19, mid]}>
            <boxGeometry args={[0.09, 0.09, run]} />
            <meshStandardMaterial color={p.ceilingAccent} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── the set for one museum ─────────────────────────────────────────────── */

export function Fixtures({ style, d }: Props) {
  const f = style.fixtures;
  const p = style.palette;
  const nodes: React.ReactNode[] = [];

  if (f.sculpture === 'pedestal-figures') {
    // one plinth every other bay, against the wall opposite the light
    for (let b = 1; b < d.bays; b += 2) {
      nodes.push(
        <group key={`s${b}`} position={[-(d.halfWidth - 1.1), 0, bayZ(d, b)]}>
          <Plinth h={1.05} w={0.58} color={p.floorInlay} />
          {/* <Figure> — see FIGURES ARE OFF above */}
        </group>,
      );
    }
  }

  if (f.sculpture === 'busts') {
    // plinths line the base of both walls, at close intervals
    for (let b = 0; b < d.bays; b++) {
      if (b % 2) continue; // one in every bay on both walls reads as fencing
      for (const side of [-1, 1]) {
        nodes.push(
          <group
            key={`bu${b}${side}`}
            position={[side * (d.halfWidth - 0.62), 0, bayZ(d, b)]}
          >
            {/* stone, not gilt: a gold column under every bust turned the
                wall base into a row of pillars taller than the sculpture */}
            <Plinth h={1.1} w={0.34} color={p.floor} />
            {/* <Bust> — see FIGURES ARE OFF above */}
          </group>,
        );
      }
    }
  }

  if (f.sculpture === 'court-figures') {
    // the Met court: plinths spaced down the paving on both sides of the walk
    for (let b = 0; b < d.bays; b++) {
      for (const side of [-1, 1]) {
        if ((b + (side > 0 ? 1 : 0)) % 2) continue;
        nodes.push(
          <group
            key={`c${b}${side}`}
            position={[side * (d.halfWidth - 1.6), 0, bayZ(d, b) + (side > 0 ? 1.2 : 0)]}
          >
            <Plinth h={0.85} w={0.66} color={p.molding} />
            {/* <Figure> — see FIGURES ARE OFF above */}
          </group>,
        );
      }
    }
  }

  if (f.ropes) {
    /*
     * Brass stanchions and red rope, down both sides in front of the plinths.
     *
     * The one piece of furniture in the Uffizi corridor that is not
     * architecture, and the thing that says most plainly that this is a museum
     * with visitors in it rather than a hall. The rope between two posts sags,
     * so it is drawn as a shallow catenary of three segments rather than as a
     * straight bar — a taut horizontal line at hip height reads as a handrail.
     */
    const span = d.bayDepth / 2;
    const posts = d.bays * 2 + 1;
    for (const side of [-1, 1]) {
      const x = side * (d.halfWidth - 1.7);
      nodes.push(
        <group key={`rope${side}`}>
          <Instanced count={posts} place={(i, m) => m.makeTranslation(x, 0.45, -i * span)}>
            <cylinderGeometry args={[0.032, 0.042, 0.9, 10]} />
            <meshStandardMaterial color="#B08A3C" metalness={0.85} roughness={0.32} />
          </Instanced>
          <Instanced count={posts} place={(i, m) => m.makeTranslation(x, 0.93, -i * span)}>
            <sphereGeometry args={[0.05, 12, 10]} />
            <meshStandardMaterial color="#B08A3C" metalness={0.85} roughness={0.28} />
          </Instanced>
          {/* the rope: three segments per span, dipping in the middle */}
          <Instanced
            count={(posts - 1) * 3}
            place={(i, m) => {
              const seg = i % 3;
              const bay = Math.floor(i / 3);
              const t = (seg + 0.5) / 3;
              const dip = 0.09 * Math.sin(t * Math.PI);
              m.makeRotationX(Math.PI / 2);
              m.setPosition(x, 0.82 - dip, -(bay + t) * span);
            }}
          >
            <cylinderGeometry args={[0.022, 0.022, span / 3 + 0.01, 8]} />
            <meshStandardMaterial color="#7A1E22" roughness={0.86} />
          </Instanced>
        </group>,
      );
    }
  }

  if (f.seating === 'bench') {
    for (let b = 0; b < d.bays; b += 3) {
      nodes.push(
        <group key={`be${b}`} position={[0, 0, bayZ(d, b)]}>
          <Bench length={d.bayDepth * 0.55} />
        </group>,
      );
    }
  }

  if (f.seating === 'ottoman') {
    for (let b = 1; b < d.bays; b += 4) {
      nodes.push(<group key={`o${b}`} position={[0, 0, bayZ(d, b)]}>{<Ottoman />}</group>);
    }
  }

  if (f.chandeliers) {
    for (let b = 0; b < d.bays; b++) {
      nodes.push(
        <group key={`ch${b}`} position={[0, d.wallHeight - 0.5, bayZ(d, b)]}>
          <Chandelier lamp={style.light.lamp} />
          <pointLight
            color={style.light.lamp}
            intensity={style.light.lampIntensity}
            distance={9}
            decay={1.8}
          />
        </group>,
      );
    }
  }

  if (f.placards) {
    for (let b = 0; b < d.bays; b++) {
      const side = b % 2 === 0 ? 1 : -1;
      nodes.push(
        <group
          key={`pl${b}`}
          position={[side * (d.halfWidth - 1.35), 0, bayZ(d, b) + d.bayDepth * 0.3]}
          rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
        >
          <Placard />
        </group>,
      );
    }
  }

  if (f.terraces) nodes.push(<Terraces key="terr" style={style} d={d} />);
  if (f.clock) {
    nodes.push(
      <GreatClock key="clock" style={style} y={d.wallHeight * 0.86} z={d.apseZ + 0.35} />,
    );
  }

  return <>{nodes}</>;
}
