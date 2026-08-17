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
function Figure({ seed, scale = 1 }: { seed: number; scale?: number }) {
  const turn = (seed * 1.7) % Math.PI;
  const lean = ((seed % 5) - 2) * 0.05;
  return (
    <group rotation={[0, turn, lean]} scale={scale}>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.2, 14]} />
        <meshStandardMaterial color={MARBLE} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.62, 6, 12]} />
        <meshStandardMaterial color={MARBLE} roughness={0.42} />
      </mesh>
      {/* drapery falling from the hip */}
      <mesh position={[0.08, 0.42, 0.04]} rotation={[0, 0, -0.18]} castShadow>
        <capsuleGeometry args={[0.12, 0.5, 5, 10]} />
        <meshStandardMaterial color={MARBLE} roughness={0.55} />
      </mesh>
      {/* raised arm, on some figures */}
      {seed % 3 === 0 && (
        <mesh position={[-0.19, 0.92, 0.02]} rotation={[0, 0, 0.7]} castShadow>
          <capsuleGeometry args={[0.055, 0.42, 4, 8]} />
          <meshStandardMaterial color={MARBLE} roughness={0.45} />
        </mesh>
      )}
      <mesh position={[0.01, 1.14, 0]} castShadow>
        <sphereGeometry args={[0.125, 16, 12]} />
        <meshStandardMaterial color={MARBLE} roughness={0.42} />
      </mesh>
    </group>
  );
}

function Bust({ seed }: { seed: number }) {
  return (
    <group rotation={[0, (seed * 2.3) % Math.PI, 0]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.4, 12]} />
        <meshStandardMaterial color={MARBLE} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.14, 14, 12]} />
        <meshStandardMaterial color={MARBLE} roughness={0.44} />
      </mesh>
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

/** low dark bench, the kind that sits down the middle of a painting gallery */
function Bench({ length }: { length: number }) {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.1, length]} />
        <meshStandardMaterial color="#2A2420" roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.19, (s * length) / 3]} castShadow>
          <boxGeometry args={[0.5, 0.36, 0.12]} />
          <meshStandardMaterial color="#1E1A16" roughness={0.6} />
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
    // one figure every other bay, set against the wall opposite the light
    for (let b = 1; b < d.bays; b += 2) {
      nodes.push(
        <group key={`s${b}`} position={[-(d.halfWidth - 1.1), 0, bayZ(d, b)]}>
          <Plinth h={1.05} w={0.58} color={p.floorInlay} />
          <group position={[0, 1.09, 0]}>
            <Figure seed={b} scale={0.95 + ((b * 7) % 11) / 60} />
          </group>
        </group>,
      );
    }
  }

  if (f.sculpture === 'busts') {
    // busts line the base of both walls, at close intervals
    for (let b = 0; b < d.bays; b++) {
      for (const side of [-1, 1]) {
        nodes.push(
          <group
            key={`bu${b}${side}`}
            position={[side * (d.halfWidth - 0.62), 0, bayZ(d, b)]}
          >
            <Plinth h={1.25} w={0.4} color={p.molding} />
            <group position={[0, 1.29, 0]}>
              <Bust seed={b * 3 + side} />
            </group>
          </group>,
        );
      }
    }
  }

  if (f.sculpture === 'court-figures') {
    // the Met court: figures spaced down the paving on both sides of the walk
    for (let b = 0; b < d.bays; b++) {
      for (const side of [-1, 1]) {
        if ((b + (side > 0 ? 1 : 0)) % 2) continue;
        nodes.push(
          <group
            key={`c${b}${side}`}
            position={[side * (d.halfWidth - 1.6), 0, bayZ(d, b) + (side > 0 ? 1.2 : 0)]}
          >
            <Plinth h={0.85} w={0.66} color={p.molding} />
            <group position={[0, 0.89, 0]}>
              <Figure seed={b * 5 + side} scale={1.05} />
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
