/**
 * The Met court's two facades.
 *
 * The court's whole character is that its two long walls disagree — smooth
 * pale marble on one side, red brick banded with white stone on the other —
 * as though a glass roof had been dropped between two different buildings.
 *
 * The first pass drew each bay as an arch outline with a ring above it, which
 * at corridor distance read as a head on a pair of shoulders: a row of stick
 * figures rather than architecture. Nothing here is an outline any more.
 * Masonry is coursed, arches are built out of voussoirs around a keystone,
 * columns have bases, shafts, necking and capitals, and every horizontal is a
 * real moulding with a shadow under it.
 *
 * Local frame: each wall is a group turned to face the corridor, so inside it
 * local X runs along the corridor, local Y is up and local Z stands proud of
 * the wall.
 */
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { MuseumStyle } from '../../types';
import type { Quality } from '../../lib/quality';
import { bayZ, type Dims } from './dims';

interface Props {
  style: MuseumStyle;
  d: Dims;
  quality: Quality;
}

function Instanced({
  count,
  place,
  children,
  castShadow = true,
}: {
  count: number;
  place: (i: number, m: THREE.Matrix4) => void;
  children: React.ReactNode;
  castShadow?: boolean;
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
    // The dependency array matters: without it this rewrites every instance
    // matrix on every React render, which for a wall of several thousand
    // bricks is thousands of Matrix4 writes each time anything re-renders.
  }, [count, place]);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      castShadow={castShadow}
      receiveShadow
    >
      {children}
    </instancedMesh>
  );
}

/** a run of moulding: fascia, a bold roll under it, and a shadow gap */
function StringCourse({
  y,
  length,
  depth,
  height,
  colour,
}: {
  y: number;
  length: number;
  depth: number;
  height: number;
  colour: string;
}) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[length, height, depth]} />
        <meshStandardMaterial color={colour} roughness={0.62} />
      </mesh>
      {/* the bold roll under the fascia — a cylinder laid along the run, which
          is what puts a real shadow under every horizontal */}
      <mesh
        position={[0, -height * 0.62, depth * 0.72]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[height * 0.34, height * 0.34, length, 10]} />
        <meshStandardMaterial color={colour} roughness={0.55} />
      </mesh>
    </group>
  );
}

/**
 * A semicircular arch built from real voussoirs around a keystone, over a
 * recessed reveal. An arch drawn as a ring is a cartoon of an arch; the
 * wedge-shaped stones and the deep shadow inside the opening are what make it
 * read as masonry.
 */
function Arch({
  x,
  springing,
  radius,
  colour,
  reveal,
  depth = 0.22,
  sill = 0,
}: {
  x: number;
  springing: number;
  radius: number;
  colour: string;
  reveal: string;
  depth?: number;
  /** y the opening starts at — it stands on the dado, not on the floor */
  sill?: number;
}) {
  const N = 13;
  const stone = (Math.PI / N) * radius * 1.06;
  return (
    <group position={[x, 0, 0]}>
      {/* The opening: a recessed plane, deliberately dark. It starts at the
          sill rather than at the floor, so the dado moulding — which stands
          further off the wall than the reveal is recessed — runs under the
          arcade instead of straight across the mouth of every opening. */}
      <mesh position={[0, (sill + springing) / 2, 0.02]}>
        <planeGeometry args={[radius * 2, springing - sill]} />
        <meshStandardMaterial color={reveal} roughness={0.95} />
      </mesh>
      {/* the sill slab the opening stands on */}
      {sill > 0 && (
        <mesh position={[0, sill, depth * 0.5]} castShadow receiveShadow>
          <boxGeometry args={[radius * 2 + 0.5, 0.1, depth * 1.4]} />
          <meshStandardMaterial color={colour} roughness={0.58} />
        </mesh>
      )}
      <mesh position={[0, springing, 0.02]}>
        <circleGeometry args={[radius, 24, 0, Math.PI]} />
        <meshStandardMaterial color={reveal} roughness={0.95} />
      </mesh>

      {/* voussoirs */}
      <Instanced
        count={N}
        castShadow={false}
        place={(i, m) => {
          const a = Math.PI * ((i + 0.5) / N);
          m.makeRotationZ(a - Math.PI / 2);
          m.setPosition(
            Math.cos(a) * (radius + 0.12),
            springing + Math.sin(a) * (radius + 0.12),
            depth / 2,
          );
        }}
      >
        <boxGeometry args={[0.24, stone, depth]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </Instanced>
      {/* keystone, larger and standing proud */}
      <mesh position={[0, springing + radius + 0.14, depth * 0.62]} castShadow>
        <boxGeometry args={[0.34, 0.44, depth * 1.25]} />
        <meshStandardMaterial color={colour} roughness={0.55} />
      </mesh>
      {/* impost blocks where the arch lands */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (radius + 0.06), springing - 0.06, depth * 0.55]}
          castShadow
        >
          <boxGeometry args={[0.4, 0.16, depth * 1.15]} />
          <meshStandardMaterial color={colour} roughness={0.58} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Engaged column: plinth, base, shaft, necking, echinus, abacus.
 *
 * Every member is stacked on the top of the one below it, with a couple of
 * centimetres of overlap so no joint can open up. The shaft used to be
 * positioned by its own centre — `height / 2 + 0.3` — which put its foot at
 * 0.60 while the base finished at 0.33, and left every column in the court
 * standing a hand's width clear of its own plinth with daylight under it.
 * Nothing here is placed by its centre any more: each piece is given the y it
 * starts at and the y it stops at, so the stack cannot come apart again.
 */
function Column({
  x,
  height,
  radius,
  colour,
}: {
  x: number;
  height: number;
  radius: number;
  colour: string;
}) {
  const z = radius * 0.7;
  const PLINTH_H = 0.2;
  const BASE_H = 0.14;
  const baseTop = PLINTH_H + BASE_H - 0.01; // 0.33: the two overlap by a hair
  const neckY = height - 0.24;
  // buried at both ends: into the base below and the necking above
  const shaftFoot = baseTop - 0.04;
  const shaftHead = neckY + 0.04;

  return (
    <group position={[x, 0, 0]}>
      {/* plinth, sitting on the floor */}
      <mesh position={[0, PLINTH_H / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[radius * 2.9, PLINTH_H, radius * 1.9]} />
        <meshStandardMaterial color={colour} roughness={0.62} />
      </mesh>
      {/* base, standing on the plinth */}
      <mesh position={[0, PLINTH_H + BASE_H / 2 - 0.005, z]} castShadow>
        <cylinderGeometry args={[radius * 1.22, radius * 1.35, BASE_H, 16]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </mesh>
      {/* shaft, running from inside the base to inside the necking */}
      <mesh position={[0, (shaftFoot + shaftHead) / 2, z]} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 0.92, radius, shaftHead - shaftFoot, 18]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      {/* necking, echinus, abacus */}
      <mesh position={[0, neckY, z]} castShadow>
        <cylinderGeometry args={[radius, radius * 0.92, 0.08, 16]} />
        <meshStandardMaterial color={colour} roughness={0.55} />
      </mesh>
      <mesh position={[0, height - 0.13, z]} castShadow>
        <cylinderGeometry args={[radius * 1.32, radius, 0.16, 16]} />
        <meshStandardMaterial color={colour} roughness={0.52} />
      </mesh>
      <mesh position={[0, height, z]} castShadow>
        <boxGeometry args={[radius * 3, 0.14, radius * 2.4]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** the warm sconce that gives the court its evening glow by day */
function Sconce({ x, y, colour }: { x: number; y: number; colour: string }) {
  return (
    <group position={[x, y, 0]}>
      <mesh position={[0, 0, 0.16]} castShadow>
        <cylinderGeometry args={[0.14, 0.09, 0.3, 12]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={1.5}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, -0.2, 0.1]} castShadow>
        <boxGeometry args={[0.1, 0.24, 0.14]} />
        <meshStandardMaterial color="#6E5A34" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function CourtFacade({ style, d, quality }: Props) {
  const p = style.palette;
  const run = d.length + d.bayDepth * 3;
  const mid = -d.length / 2;
  const H = d.wallHeight;
  const glow = style.light.lamp;

  /** brick coursing: mortar beds plus staggered perpends */
  const COURSES = Math.round(H / 0.26);
  const courseH = H / COURSES;
  const perpendsPerCourse = Math.round(run / 0.52);

  return (
    <group>
      {[-1, 1].map((side) => {
        const brick = side > 0;
        // local X runs along the corridor; +Z stands proud of the wall
        const toLocal = (z: number) => (side > 0 ? z : -z);

        /*
         * Which bays of THIS wall carry a painting.
         *
         * The court hangs `alternating`: bay 0 hangs on the +1 wall, bay 1 on
         * the -1 wall, and so on, so each wall is picture, gap, picture, gap.
         * The arcade is set into the gaps and the columns onto the divisions
         * between them, which is the whole rhythm of the room: column,
         * painting, column, opening, column. Nothing is ever placed on a bay
         * centre that a canvas is already using.
         */
        const hung = (b: number) =>
          style.hang === 'alternating' ? (b % 2 === 0 ? 1 : -1) === side : true;
        const openBays = Array.from({ length: d.bays }, (_, b) => b).filter((b) => !hung(b));

        return (
          <group
            key={side}
            position={[side * d.halfWidth, 0, 0]}
            rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {/* the field */}
            <mesh position={[mid, H / 2, 0]} receiveShadow>
              <planeGeometry args={[run, H]} />
              <meshStandardMaterial
                color={brick ? p.wallDeep : p.wall}
                roughness={brick ? 0.94 : 0.6}
              />
            </mesh>

            {brick ? (
              <group>
                {/* mortar beds, the full length of the wall */}
                <Instanced
                  count={COURSES}
                  castShadow={false}
                  place={(i, m) => m.makeTranslation(mid, (i + 1) * courseH, 0.012)}
                >
                  <boxGeometry args={[run, 0.022, 0.024]} />
                  <meshStandardMaterial color={p.molding} roughness={0.9} />
                </Instanced>
                {/* perpends, staggered half a brick on alternate courses */}
                <Instanced
                  count={COURSES * perpendsPerCourse}
                  castShadow={false}
                  place={(i, m) => {
                    const c = Math.floor(i / perpendsPerCourse);
                    const k = i % perpendsPerCourse;
                    const offset = c % 2 ? 0.26 : 0;
                    m.makeTranslation(
                      mid - run / 2 + k * 0.52 + offset,
                      c * courseH + courseH / 2,
                      0.012,
                    );
                  }}
                >
                  <boxGeometry args={[0.02, courseH * 0.82, 0.022]} />
                  <meshStandardMaterial color={p.molding} roughness={0.9} />
                </Instanced>
              </group>
            ) : (
              /* marble ashlar: wide blocks with fine joints, and a polish */
              <group>
                <Instanced
                  count={Math.round(H / 0.95)}
                  castShadow={false}
                  place={(i, m) => m.makeTranslation(mid, (i + 1) * 0.95, 0.01)}
                >
                  <boxGeometry args={[run, 0.016, 0.02]} />
                  <meshStandardMaterial color={p.floorInlay} roughness={0.7} />
                </Instanced>
                <Instanced
                  count={Math.round(run / 1.9) * Math.round(H / 0.95)}
                  castShadow={false}
                  place={(i, m) => {
                    const perRow = Math.round(run / 1.9);
                    const rowI = Math.floor(i / perRow);
                    const k = i % perRow;
                    m.makeTranslation(
                      mid - run / 2 + k * 1.9 + (rowI % 2 ? 0.95 : 0),
                      rowI * 0.95 + 0.475,
                      0.01,
                    );
                  }}
                >
                  <boxGeometry args={[0.016, 0.95, 0.02]} />
                  <meshStandardMaterial color={p.floorInlay} roughness={0.7} />
                </Instanced>
              </group>
            )}

            {/* Marble plinth and dado along the base of both walls, sitting
                low enough to pass under the frames. At its old height the
                fascia — which stands 0.2 off the wall, further out than a
                frame does — crossed the bottom edge of every canvas. */}
            <mesh position={[mid, 0.28, 0.09]} castShadow receiveShadow>
              <boxGeometry args={[run, 0.56, 0.18]} />
              <meshStandardMaterial color={p.molding} roughness={0.5} />
            </mesh>
            <StringCourse y={0.6} length={run} depth={0.2} height={0.14} colour={p.molding} />

            {/* The arcade, in the bays this wall hangs nothing in. An arch
                behind a canvas puts voussoirs and impost blocks through its
                frame, so an opening and a painting never share a bay. */}
            {openBays.map((b) => (
              <Arch
                key={b}
                x={toLocal(bayZ(d, b))}
                springing={2.5}
                radius={brick ? 1.15 : 0.95}
                colour={p.molding}
                reveal={brick ? '#3A241E' : '#6E6656'}
                depth={brick ? 0.26 : 0.2}
                sill={0.72}
              />
            ))}

            {/* Engaged columns on the bay DIVISIONS — they are what separates
                one painting from the next. They used to be placed at `bayZ`,
                the bay centre, which is precisely where the canvas hangs: the
                shaft came down the middle of every picture in the court. */}
            {Array.from({ length: d.bays + 1 }, (_, i) => (
              <Column
                key={i}
                x={toLocal(-i * d.bayDepth)}
                height={H - 1.15}
                radius={0.24}
                colour={p.molding}
              />
            ))}

            {/* entablature: architrave, frieze, dentils, cornice */}
            <StringCourse y={H - 1.0} length={run} depth={0.24} height={0.16} colour={p.molding} />
            <Instanced
              count={Math.round(run / 0.34)}
              castShadow={false}
              place={(i, m) =>
                m.makeTranslation(mid - run / 2 + i * 0.34, H - 0.62, 0.2)
              }
            >
              <boxGeometry args={[0.15, 0.19, 0.2]} />
              <meshStandardMaterial color={p.molding} roughness={0.6} />
            </Instanced>
            <mesh position={[mid, H - 0.3, 0.17]} castShadow receiveShadow>
              <boxGeometry args={[run, 0.4, 0.34]} />
              <meshStandardMaterial color={p.molding} roughness={0.55} />
            </mesh>

            {/* the warm glow: a sconce over each opening — never over a
                painting, where it would sit on the canvas — playing against
                the cool daylight coming through the roof */}
            {openBays.map((b) => (
              <Sconce
                key={`sc${b}`}
                x={toLocal(bayZ(d, b))}
                y={2.5 + (brick ? 1.15 : 0.95) + 0.95}
                colour={glow}
              />
            ))}
          </group>
        );
      })}

      {/* One warm light per opening, close enough to the masonry to graze it
          — this is what makes brick look like brick. They stand where the
          sconces do, so the glow and the fitting that explains it agree, and
          each one washes the pictures on the wall opposite. */}
      {Array.from({ length: Math.min(d.bays, quality.maxLamps) }, (_, k) => {
        const step = Math.min(d.bays, quality.maxLamps);
        const b = Math.round((k * d.bays) / step);
        // the wall this bay leaves open is the one the sconce is on
        const side = style.hang === 'alternating' ? (b % 2 === 0 ? -1 : 1) : b % 2 ? 1 : -1;
        return (
          <pointLight
            key={k}
            position={[side * (d.halfWidth - 0.7), 3.6, bayZ(d, b)]}
            color={glow}
            intensity={style.light.lampIntensity * 2.4}
            distance={d.bayDepth * 2.4}
            decay={1.9}
          />
        );
      })}
    </group>
  );
}
