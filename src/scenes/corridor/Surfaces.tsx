/**
 * Floors and wall treatments.
 *
 * The floor carries the reflection that makes a long gallery read as long, and
 * the wall treatment carries the museum's identity at eye level. Both are
 * selected by the style record; neither knows anything about the artworks.
 */
import { useLayoutEffect, useRef } from 'react';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import type { MuseumStyle } from '../../types';
import type { Quality } from '../../lib/quality';
import { bayZ, hangBottom, hangTop, type Dims } from './dims';
import { CourtFacade } from './CourtFacade';

interface Props {
  style: MuseumStyle;
  d: Dims;
  quality: Quality;
}

function Instanced({
  count,
  place,
  children,
  castShadow,
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
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow={castShadow}>
      {children}
    </instancedMesh>
  );
}

/* ── floors ─────────────────────────────────────────────────────────────── */

/** one square of the Uffizi's diagonal checkerboard, metres */
const TILE = 0.9;

export function Floor({ style, d, quality }: Props) {
  const p = style.palette;
  const kind = style.floor;
  const mid = -d.length / 2;
  const run = d.length + d.bayDepth * 3;
  const w = d.halfWidth * 2;

  // how wet the floor looks. Polished marble and stone throw long specular
  // streaks down a gallery; a courtyard pavement does not.
  const mirror =
    kind === 'checkerboard'
      ? 0.72
      : kind === 'marble-inlay'
        ? 0.62
        : kind === 'court-paving'
          ? 0.22
          : kind === 'parquet'
            ? 0.4
            : 0.5;
  const roughness =
    kind === 'court-paving' ? 0.5 : kind === 'parquet' ? 0.3 : kind === 'checkerboard' ? 0.12 : 0.18;

  return (
    <group>
      {/* The mirrored floor renders the whole scene a second time into a
          buffer. It is the most expensive thing in the room by a wide margin,
          so below the top budget it becomes a polished standard material:
          still glossy under the lamps, no second pass. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, mid]} receiveShadow>
        <planeGeometry args={[w, run]} />
        {quality.reflections ? (
          <MeshReflectorMaterial
            resolution={quality.reflectionRes}
            blur={[400, 100]}
            mixBlur={0.85}
            mixStrength={kind === 'court-paving' ? 0.35 : 0.6}
            roughness={roughness}
            depthScale={0.7}
            minDepthThreshold={0.4}
            color={p.floor}
            metalness={0.18}
            mirror={mirror}
          />
        ) : (
          <meshStandardMaterial
            color={p.floor}
            roughness={Math.min(0.55, roughness + 0.22)}
            metalness={0.24}
            envMapIntensity={1.2}
          />
        )}
      </mesh>

      {kind === 'checkerboard' && (
        /*
         * A diagonal checkerboard, laid as one instanced tile.
         *
         * Only the dark squares are drawn — the pale ones are the floor plane
         * showing through, which halves the instance count and means the
         * reflection underneath is uninterrupted. The whole field is turned
         * forty-five degrees, because the Uffizi's is laid on the diagonal and
         * that is most of what makes it read as that corridor: a square grid
         * runs parallel with the walls and disappears; a diagonal one drives
         * every line toward the far window.
         */
        <group position={[0, 0.003, mid]} rotation={[0, Math.PI / 4, 0]}>
          <Instanced
            count={Math.ceil((w + run) / TILE) ** 2 / 2}
            place={(i, m) => {
              const cols = Math.ceil((w + run) / TILE);
              const row = Math.floor((i * 2) / cols);
              const col = ((i * 2) % cols) + (row % 2);
              m.makeTranslation(
                (col - cols / 2 + 0.5) * TILE,
                0,
                (row - cols / 2 + 0.5) * TILE,
              );
            }}
          >
            <boxGeometry args={[TILE, 0.004, TILE]} />
            <meshStandardMaterial
              color={p.floorInlay}
              roughness={0.2}
              metalness={0.18}
            />
          </Instanced>
        </group>
      )}

      {kind === 'parquet' && (
        // light polished boards running the length of the room
        <Instanced
          count={Math.floor(w / 0.42)}
          place={(i, m) => m.makeTranslation(-w / 2 + 0.21 + i * 0.42, 0.004, mid)}
        >
          <boxGeometry args={[0.02, 0.004, run]} />
          <meshStandardMaterial color={p.floorInlay} roughness={0.45} />
        </Instanced>
      )}

      {kind === 'marble-inlay' && (
        <group>
          {/* border bands in dark marble */}
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[s * (d.halfWidth - 0.55), 0.005, mid]}
            >
              <planeGeometry args={[0.34, run]} />
              <meshStandardMaterial color={p.floorInlay} roughness={0.22} metalness={0.15} />
            </mesh>
          ))}
          {/* a repeating geometric medallion down the centre of the gallery */}
          <Instanced
            count={d.bays}
            place={(i, m) => {
              m.makeRotationX(-Math.PI / 2);
              m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 4));
              m.setPosition(0, 0.006, bayZ(d, i));
            }}
          >
            <planeGeometry args={[1.5, 1.5]} />
            <meshStandardMaterial color={p.floorInlay} roughness={0.2} metalness={0.15} />
          </Instanced>
          <Instanced
            count={d.bays}
            place={(i, m) => {
              m.makeRotationX(-Math.PI / 2);
              m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 4));
              m.setPosition(0, 0.007, bayZ(d, i));
            }}
          >
            <planeGeometry args={[0.9, 0.9]} />
            <meshStandardMaterial color={p.wall} roughness={0.22} metalness={0.12} />
          </Instanced>
        </group>
      )}

      {kind === 'promenade' && (
        // a wide central walkway with the galleries raised either side
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, mid]}>
          <planeGeometry args={[w * 0.46, run]} />
          <meshStandardMaterial color={p.floorInlay} roughness={0.28} metalness={0.1} />
        </mesh>
      )}

      {kind === 'court-paving' && (
        // large slabs: grout lines across and along
        <group>
          <Instanced
            count={Math.floor(run / 1.6)}
            place={(i, m) => {
              m.makeRotationX(-Math.PI / 2);
              m.setPosition(0, 0.004, -i * 1.6);
            }}
          >
            <planeGeometry args={[w, 0.035]} />
            <meshStandardMaterial color={p.floorInlay} roughness={0.7} />
          </Instanced>
          <Instanced
            count={Math.floor(w / 1.6)}
            place={(i, m) => {
              m.makeRotationX(-Math.PI / 2);
              m.setPosition(-w / 2 + 0.8 + i * 1.6, 0.004, mid);
            }}
          >
            <planeGeometry args={[0.035, run]} />
            <meshStandardMaterial color={p.floorInlay} roughness={0.7} />
          </Instanced>
        </group>
      )}
    </group>
  );
}

/* ── wall treatments ────────────────────────────────────────────────────── */

export function Walls({ style, d, quality }: Props) {
  const p = style.palette;
  const mid = -d.length / 2;
  const run = d.length + d.bayDepth * 3;
  const kind = style.wall;

  /** the base plane of one wall, which every treatment starts from */
  const base = (side: 1 | -1, color: string) => (
    <mesh
      position={[side * d.halfWidth, d.wallHeight / 2, mid]}
      rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
      receiveShadow
    >
      <planeGeometry args={[run, d.wallHeight]} />
      <meshStandardMaterial color={color} roughness={0.88} />
    </mesh>
  );

  /**
   * Skirting and dado, common to the picture galleries.
   *
   * The rail is held under the hang. Each treatment asks for the height it
   * wants, but a rail standing 0.08 off the wall that lands inside the
   * pictures is a gold moulding running through the bottom edge of every
   * frame in the room — which is what the crimson room did, and what the eye
   * goes to first. So the requested height is a ceiling, not a promise.
   */
  const railY = Math.max(0.5, hangBottom(d, style) - 0.12);
  const bands = (side: 1 | -1, dado: string, dadoY: number) => (
    <group key={`b${side}`}>
      <mesh position={[side * (d.halfWidth - 0.02), 0.09, mid]} receiveShadow>
        <boxGeometry args={[0.08, 0.18, run]} />
        <meshStandardMaterial color={dado} roughness={0.7} />
      </mesh>
      <mesh position={[side * (d.halfWidth - 0.03), Math.min(dadoY, railY), mid]} receiveShadow>
        <boxGeometry args={[0.1, 0.1, run]} />
        <meshStandardMaterial color={dado} roughness={0.7} />
      </mesh>
    </group>
  );

  if (kind === 'court-facade') return <CourtFacade style={style} d={d} quality={quality} />;

  if (kind === 'uffizi-corridor') {
    /*
     * The Uffizi's east corridor is asymmetric and that is the whole of its
     * character: paintings down one side, and down the other a run of tall
     * windows that is doing all the lighting in the room. Standing in it, the
     * hang is always on your left and the light is always on your right.
     *
     * Above the pictures, on both walls, runs a continuous frieze of small
     * dark-framed portraits — several hundred of them in the real corridor,
     * instanced here as one draw of plain dark panels, because from the floor
     * that is exactly what they are.
     */
    // the real bays are wide; a mullion every metre reads as a picket fence
    const glazing = 2.1;
    const nWindows = Math.round(run / glazing);
    const friezeY = hangTop(d, style) + 0.42;
    return (
      <group>
        {/* the hung wall */}
        {base(-1, p.wall)}
        {bands(-1, p.molding, 1.0)}

        {/* the glazed wall: a bright plane behind a grid of stone mullions */}
        <mesh
          position={[d.halfWidth, d.wallHeight / 2, mid]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[run, d.wallHeight]} />
          {/* basic, not standard: this is the light source in the room, and a
              shaded surface here reads as a painted wall rather than as day */}
          <meshBasicMaterial color={p.sky} toneMapped={false} />
        </mesh>
        {/* the pier between each window */}
        <Instanced
          count={nWindows + 1}
          castShadow
          place={(i, m) =>
            m.makeTranslation(
              d.halfWidth - 0.14,
              d.wallHeight / 2,
              mid - run / 2 + i * glazing,
            )
          }
        >
          <boxGeometry args={[0.36, d.wallHeight, 0.5]} />
          <meshStandardMaterial color={p.wallDeep} roughness={0.86} />
        </Instanced>
        {/* the transom and the sill, which is what makes them windows and not
            a gap between columns */}
        {[d.wallHeight * 0.78, 1.05].map((y) => (
          <mesh key={y} position={[d.halfWidth - 0.13, y, mid]}>
            <boxGeometry args={[0.32, 0.16, run]} />
            <meshStandardMaterial color={p.molding} roughness={0.82} />
          </mesh>
        ))}
        {/* below the sill the wall is solid */}
        <mesh position={[d.halfWidth - 0.06, 0.52, mid]}>
          <boxGeometry args={[0.14, 1.05, run]} />
          <meshStandardMaterial color={p.wall} roughness={0.88} />
        </mesh>
        {bands(1, p.molding, 1.0)}

        {/* the portrait frieze, both walls */}
        {[-1, 1].map((side) => (
          <Instanced
            key={side}
            count={Math.round(run / 0.62)}
            place={(i, m) =>
              m.makeTranslation(
                side * (d.halfWidth - 0.07),
                friezeY,
                mid - run / 2 + 0.31 + i * 0.62,
              )
            }
          >
            <boxGeometry args={[0.06, 0.44, 0.36]} />
            <meshStandardMaterial color="#3A2A1C" roughness={0.72} />
          </Instanced>
        ))}
        {/* the rail the frieze sits on */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (d.halfWidth - 0.05), friezeY - 0.3, mid]}>
            <boxGeometry args={[0.11, 0.09, run]} />
            <meshStandardMaterial color={p.gilt} metalness={0.6} roughness={0.45} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === 'fresco-maps') {
    // Painted map panels between gilded pilasters, busts along the base.
    return (
      <group>
        {base(-1, p.wallDeep)}
        {base(1, p.wallDeep)}
        {[-1, 1].map((side) => (
          <group key={side}>
            {Array.from({ length: d.bays }, (_, b) => (
              <mesh
                key={b}
                position={[side * (d.halfWidth - 0.04), d.wallHeight * 0.56, bayZ(d, b)]}
                rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
              >
                <planeGeometry args={[d.bayDepth * 0.78, d.wallHeight * 0.62]} />
                <meshStandardMaterial
                  color={b % 2 ? p.wall : p.accent}
                  roughness={0.92}
                />
              </mesh>
            ))}
            {/* gilded pilasters at every bay division */}
            <Instanced
              count={d.bays + 1}
              castShadow
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - 0.09),
                  d.wallHeight / 2,
                  -i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[0.18, d.wallHeight, 0.42]} />
              <meshStandardMaterial color={p.molding} metalness={0.6} roughness={0.42} />
            </Instanced>
            {bands(side as 1 | -1, p.molding, 1.15)}
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'carved-stone') {
    // Orsay: light carved stone, arched recesses, deep rosettes.
    return (
      <group>
        {base(-1, p.wall)}
        {base(1, p.wall)}
        {[-1, 1].map((side) => (
          <group key={side}>
            {Array.from({ length: d.bays }, (_, b) => (
              <group
                key={b}
                position={[side * (d.halfWidth - 0.05), 0, bayZ(d, b)]}
                rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
              >
                <mesh position={[0, d.wallHeight * 0.52, 0]}>
                  <planeGeometry args={[d.bayDepth * 0.74, d.wallHeight * 0.66]} />
                  <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
                </mesh>
                <mesh position={[0, d.wallHeight * 0.85, 0.01]}>
                  <circleGeometry args={[d.bayDepth * 0.37, 24, 0, Math.PI]} />
                  <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
                </mesh>
                <mesh position={[0, d.wallHeight * 0.9, 0.02]}>
                  <ringGeometry args={[0.2, 0.3, 18]} />
                  <meshStandardMaterial color={p.molding} roughness={0.72} />
                </mesh>
              </group>
            ))}
            <Instanced
              count={d.bays + 1}
              castShadow
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - 0.1),
                  d.wallHeight / 2,
                  -i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[0.2, d.wallHeight, 0.55]} />
              <meshStandardMaterial color={p.molding} roughness={0.8} />
            </Instanced>
            {bands(side as 1 | -1, p.molding, 1.1)}
          </group>
        ))}
      </group>
    );
  }

  // 'salon' (Louvre) and 'crimson-enfilade' (National Gallery) share a
  // construction and differ in colour and in where the rails sit.
  const crimson = kind === 'crimson-enfilade';
  return (
    <group>
      {base(-1, p.wall)}
      {base(1, p.wall)}
      {[-1, 1].map((side) => (
        <group key={side}>
          {bands(side as 1 | -1, crimson ? p.gilt : p.molding, crimson ? 1.0 : 1.12)}
          {crimson && (
            // the picture rail the big gold frames hang from
            <mesh position={[side * (d.halfWidth - 0.04), d.wallHeight - 0.35, mid]}>
              <boxGeometry args={[0.12, 0.14, run]} />
              <meshStandardMaterial color={p.gilt} metalness={0.65} roughness={0.42} />
            </mesh>
          )}
          {!crimson && (
            // shallow pilasters dividing the salon hang into bays
            <Instanced
              count={d.bays + 1}
              castShadow
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - 0.07),
                  d.wallHeight / 2,
                  -i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[0.14, d.wallHeight, 0.36]} />
              <meshStandardMaterial color={p.molding} roughness={0.78} />
            </Instanced>
          )}
        </group>
      ))}
    </group>
  );
}
