/**
 * What stands on the floor and hangs from the ceiling.
 *
 * Furniture is what stops a corridor reading as a rendering: the benches,
 * plinths, busts, chandeliers and label stands are how you know the space is
 * meant to be walked through by people. Each museum's style record picks its
 * own set.
 */
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { MuseumStyle } from '../../types';
import { bayZ, type Dims } from './dims';

interface Props {
  style: MuseumStyle;
  d: Dims;
}

const MARBLE = '#E9E3D6';

/**
 * An abstracted classical figure. Real museum sculpture is scanned, and the
 * CC0 scan libraries are not reachable from this build — so these are honest
 * abstractions: a mass, a torso, a head, drapery, at the right scale and with
 * the right silhouette at corridor distance.
 */
const marble = (rough = 0.44) => (
  <meshStandardMaterial color={MARBLE} roughness={rough} />
);

/** limb, torso, drapery fold — everything on these figures is a capsule */
function Limb({
  p,
  r,
  len,
  rot,
  rough = 0.44,
}: {
  p: [number, number, number];
  r: number;
  len: number;
  rot?: [number, number, number];
  rough?: number;
}) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <capsuleGeometry args={[r, len, 5, 10]} />
      {marble(rough)}
    </mesh>
  );
}

/** the head, with the mass of hair that reads at ten metres */
function Head({ p, r = 0.115 }: { p: [number, number, number]; r?: number }) {
  return (
    <group position={p}>
      <mesh castShadow>
        <sphereGeometry args={[r, 16, 12]} />
        {marble(0.42)}
      </mesh>
      <mesh position={[0, r * 0.42, -r * 0.28]} scale={[1.12, 0.86, 1.1]} castShadow>
        <sphereGeometry args={[r, 14, 10]} />
        {marble(0.55)}
      </mesh>
    </group>
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
      {/* plinth block every type stands on */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.29, 0.1, 16]} />
        {marble(0.55)}
      </mesh>

      {variant === 0 && (
        <group>
          {/* drapery to the ankles — a fluted column with a body inside it */}
          <mesh position={[0, 0.52, 0]} castShadow>
            <cylinderGeometry args={[0.19, 0.27, 0.86, 14]} />
            {marble(0.52)}
          </mesh>
          {/* folds */}
          {[-0.11, 0.02, 0.13].map((x, i) => (
            <Limb key={i} p={[x, 0.5, 0.15 - i * 0.03]} r={0.035} len={0.72} rough={0.6} />
          ))}
          <Limb p={[0, 1.06, 0]} r={0.145} len={0.24} />
          {/* arms: one down inside the drapery, one across the waist */}
          <Limb p={[-0.19, 0.98, 0.02]} r={0.05} len={0.34} rot={[0, 0, 0.08]} />
          <Limb p={[0.17, 0.96, 0.1]} r={0.05} len={0.3} rot={[0.3, 0, -0.5]} />
          <Head p={[0, 1.32, 0.01]} />
        </group>
      )}

      {variant === 1 && (
        <group>
          {/* weight leg straight, free leg bent and trailing */}
          <Limb p={[-0.09, 0.38, 0]} r={0.075} len={0.52} />
          <Limb p={[0.1, 0.36, -0.06]} r={0.07} len={0.46} rot={[0.16, 0, -0.1]} />
          {/* hips shifted over the weight leg — the whole point of the type */}
          <mesh position={[-0.03, 0.74, 0]} castShadow>
            <sphereGeometry args={[0.16, 14, 12]} />
            {marble()}
          </mesh>
          <mesh position={[-0.01, 0.98, 0]} scale={[1, 1.15, 0.72]} castShadow>
            <sphereGeometry args={[0.19, 16, 12]} />
            {marble()}
          </mesh>
          {/* one arm hanging, one bent across */}
          <Limb p={[-0.24, 0.92, 0.02]} r={0.048} len={0.44} rot={[0, 0, 0.12]} />
          <Limb p={[0.23, 0.95, 0.06]} r={0.048} len={0.36} rot={[0.4, 0, -0.35]} />
          <Head p={[0.02, 1.28, 0.02]} />
        </group>
      )}

      {variant === 2 && (
        <group>
          {/* the seat */}
          <mesh position={[0, 0.28, -0.08]} castShadow receiveShadow>
            <boxGeometry args={[0.46, 0.36, 0.4]} />
            {marble(0.6)}
          </mesh>
          {/* thighs forward, shins down */}
          <Limb p={[-0.11, 0.5, 0.12]} r={0.075} len={0.3} rot={[1.42, 0, 0]} />
          <Limb p={[0.11, 0.5, 0.14]} r={0.075} len={0.32} rot={[1.3, 0, 0]} />
          <Limb p={[-0.11, 0.24, 0.28]} r={0.06} len={0.3} />
          <Limb p={[0.11, 0.24, 0.3]} r={0.06} len={0.28} />
          {/* torso leaning back, drapery over the lap */}
          <mesh position={[0, 0.8, -0.02]} rotation={[-0.16, 0, 0]} castShadow>
            <capsuleGeometry args={[0.15, 0.3, 6, 12]} />
            {marble()}
          </mesh>
          {/* shoulders and neck, so the head is not sitting on the chest */}
          <mesh position={[0, 0.97, -0.03]} scale={[1.4, 0.6, 0.85]} castShadow>
            <sphereGeometry args={[0.14, 14, 10]} />
            {marble()}
          </mesh>
          <mesh position={[0, 1.06, -0.02]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 0.09, 10]} />
            {marble()}
          </mesh>
          <mesh position={[0, 0.62, 0.16]} rotation={[1.35, 0, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.22, 0.34, 12]} />
            {marble(0.58)}
          </mesh>
          {/* one arm propping, one resting on the knee */}
          <Limb p={[-0.25, 0.72, -0.06]} r={0.05} len={0.36} rot={[0, 0, 0.22]} />
          <Limb p={[0.2, 0.74, 0.16]} r={0.05} len={0.3} rot={[0.9, 0, -0.2]} />
          <Head p={[0, 1.18, 0]} r={0.1} />
        </group>
      )}

      {variant === 3 && (
        <group>
          <Limb p={[-0.1, 0.36, 0.02]} r={0.072} len={0.48} rot={[0, 0, 0.06]} />
          <Limb p={[0.12, 0.34, -0.1]} r={0.068} len={0.42} rot={[-0.22, 0, -0.14]} />
          <mesh position={[0, 0.72, 0]} castShadow>
            <sphereGeometry args={[0.155, 14, 12]} />
            {marble()}
          </mesh>
          {/* torso twisted toward the raised arm */}
          <mesh position={[-0.02, 0.96, 0]} rotation={[0, 0.3, 0.06]} scale={[1, 1.12, 0.74]} castShadow>
            <sphereGeometry args={[0.185, 16, 12]} />
            {marble()}
          </mesh>
          {/* the raised arm — upper arm out, forearm up */}
          <Limb p={[-0.26, 1.06, 0.04]} r={0.048} len={0.3} rot={[0, 0, 0.95]} />
          <Limb p={[-0.4, 1.3, 0.06]} r={0.043} len={0.28} rot={[0, 0, 0.28]} />
          {/* the other holds a fold of cloak that falls behind */}
          <Limb p={[0.24, 0.92, 0.04]} r={0.048} len={0.38} rot={[0, 0, -0.1]} />
          <mesh position={[0.28, 0.74, -0.1]} rotation={[0.1, 0, -0.16]} castShadow>
            <capsuleGeometry args={[0.1, 0.52, 5, 10]} />
            {marble(0.58)}
          </mesh>
          <Head p={[-0.04, 1.28, 0.03]} />
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
 */
function GreatClock({ style, y, z }: { style: MuseumStyle; y: number; z: number }) {
  const p = style.palette;
  const R = 2.4;
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

  return (
    <group position={[0, y, z]}>
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
  const deck = 3.1;
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
    // One figure every other bay, against the wall opposite the light. The
    // seed is a running count, not the bay number: stepping the bay by two
    // walks the variant by two as well, so half the types would never appear.
    let n = 0;
    for (let b = 1; b < d.bays; b += 2) {
      const seed = n++;
      nodes.push(
        <group key={`s${b}`} position={[-(d.halfWidth - 1.1), 0, bayZ(d, b)]}>
          <Plinth h={1.05} w={0.58} color={p.floorInlay} />
          <group position={[0, 1.09, 0]}>
            <Figure seed={seed} scale={0.95 + ((b * 7) % 11) / 60} />
          </group>
        </group>,
      );
    }
  }

  if (f.sculpture === 'busts') {
    // busts line the base of both walls, at close intervals
    let n = 0;
    for (let b = 0; b < d.bays; b++) {
      if (b % 2) continue; // a bust in every bay on both walls reads as fencing
      for (const side of [-1, 1]) {
        const seed = n++;
        nodes.push(
          <group
            key={`bu${b}${side}`}
            position={[side * (d.halfWidth - 0.62), 0, bayZ(d, b)]}
          >
            {/* stone, not gilt: a gold column under every bust turned the
                wall base into a row of pillars taller than the sculpture */}
            <Plinth h={1.1} w={0.34} color={p.floor} />
            <group position={[0, 1.14, 0]}>
              <Bust seed={seed} />
            </group>
          </group>,
        );
      }
    }
  }

  if (f.sculpture === 'court-figures') {
    // the Met court: figures spaced down the paving on both sides of the walk
    let n = 0;
    for (let b = 0; b < d.bays; b++) {
      for (const side of [-1, 1]) {
        if ((b + (side > 0 ? 1 : 0)) % 2) continue;
        const seed = n++;
        nodes.push(
          <group
            key={`c${b}${side}`}
            position={[side * (d.halfWidth - 1.6), 0, bayZ(d, b) + (side > 0 ? 1.2 : 0)]}
          >
            <Plinth h={0.85} w={0.66} color={p.molding} />
            <group position={[0, 0.89, 0]}>
              <Figure seed={seed} scale={1.05} />
            </group>
          </group>,
        );
      }
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
