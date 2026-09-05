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
import { glowTexture } from './glow';

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

  if (kind === 'pier-alcoves') {
    /*
     * The British Museum's sculpture hall: the wall IS a colonnade.
     *
     * Both sides are a march of thick square piers stepping back toward the
     * vanishing point, and the flat spans between them are shallow alcoves —
     * which, with the sculpture taken out, is what the paintings hang in. The
     * whole character of the room is that rhythm, so the piers are the only
     * thing given any depth: everything else is plain pale stone.
     *
     * At the mouth stand the two colossal fluted columns that frame the view.
     * They are round where everything else is square, they are the first thing
     * in the frame, and they are what makes the hall read as a proscenium
     * rather than as a corridor.
     */
    const pierW = 0.9;
    const pierD = 0.62;
    return (
      <group>
        {base(-1, p.wallDeep)}
        {base(1, p.wallDeep)}
        {[-1, 1].map((side) => (
          <group key={side}>
            {/* the alcove face: a pale flat span set between the piers, which
                is the surface a canvas is actually hung on */}
            <mesh
              position={[side * (d.halfWidth - 0.03), d.wallHeight / 2, mid]}
              rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
              receiveShadow
            >
              <planeGeometry args={[run, d.wallHeight]} />
              <meshStandardMaterial color={p.wall} roughness={0.9} />
            </mesh>

            {/* the piers */}
            <Instanced
              count={d.bays + 2}
              castShadow
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - pierD / 2 + 0.02),
                  d.wallHeight / 2,
                  d.bayDepth * 0.5 - i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[pierD, d.wallHeight, pierW]} />
              <meshStandardMaterial color={p.molding} roughness={0.86} />
            </Instanced>
            {/* their plinths and capitals: two square steps, no curves */}
            {[0.22, d.wallHeight - 0.22].map((y) => (
              <Instanced
                key={y}
                count={d.bays + 2}
                place={(i, m) =>
                  m.makeTranslation(
                    side * (d.halfWidth - pierD / 2 + 0.02),
                    y,
                    d.bayDepth * 0.5 - i * d.bayDepth,
                  )
                }
              >
                <boxGeometry args={[pierD + 0.16, 0.44, pierW + 0.16]} />
                <meshStandardMaterial color={p.molding} roughness={0.84} />
              </Instanced>
            ))}
            {/* the skirting, unbroken along the alcove faces */}
            <mesh position={[side * (d.halfWidth - 0.06), 0.16, mid]} receiveShadow>
              <boxGeometry args={[0.12, 0.32, run]} />
              <meshStandardMaterial color={p.molding} roughness={0.82} />
            </mesh>
          </group>
        ))}

        {/* The two colossal fluted columns at the mouth. Round where the rest
            of the hall is square, and close enough to the camera at the start
            of the walk to frame the whole view. */}
        {[-1, 1].map((side) => (
          <group key={`col${side}`} position={[side * (d.halfWidth - 0.5), 0, d.bayDepth * 1.3]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.72, 0.78, d.wallHeight, 24]} />
              <meshStandardMaterial color={p.molding} roughness={0.8} />
            </mesh>
            {/* the flutes: shallow half-round channels round the shaft */}
            <Instanced
              count={20}
              place={(i, m) => {
                const a = (i / 20) * Math.PI * 2;
                m.makeTranslation(Math.cos(a) * 0.74, d.wallHeight / 2, Math.sin(a) * 0.74);
              }}
            >
              <boxGeometry args={[0.07, d.wallHeight, 0.07]} />
              <meshStandardMaterial color={p.wallDeep} roughness={0.88} />
            </Instanced>
            <mesh position={[0, d.wallHeight - 0.3, 0]} castShadow>
              <boxGeometry args={[1.9, 0.6, 1.9]} />
              <meshStandardMaterial color={p.molding} roughness={0.82} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <boxGeometry args={[1.9, 0.44, 1.9]} />
              <meshStandardMaterial color={p.molding} roughness={0.82} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'uffizi-corridor') {
    /*
     * The Uffizi's east corridor is asymmetric, and that asymmetry is the
     * whole of its character: the pictures are on your left and the light is
     * on your right, all the way down. Nothing hangs opposite the windows —
     * anything there would be looked at against the day and seen as a
     * silhouette, which is why the real corridor does not hang there either.
     *
     * The light is the subject. The glazed wall is unshaded so it stays the
     * brightest thing in the room whatever the exposure does, the mullions
     * between the windows are slender enough to be joinery rather than
     * columns, and a warm patch is laid on the floor under each opening — the
     * one thing that makes a bright wall read as daylight coming IN rather
     * than as a lit panel.
     *
     * Above both hangs runs the frieze of small dark-framed portraits: several
     * hundred of them in the real corridor, one instanced draw here, because
     * from the floor that is exactly what they are.
     */
    const glazing = 2.2;
    const nWindows = Math.max(1, Math.round(run / glazing));
    const pitch = run / nWindows;
    /** the sill, and the head — sized so the frieze clears the openings */
    const sill = 0.95;
    const head = Math.min(d.wallHeight * 0.74, hangTop(d, style) - 0.1);
    const friezeY = hangTop(d, style) + 0.46;
    /** centre-line z of window i */
    const winZ = (i: number) => mid - run / 2 + pitch * (i + 0.5);

    return (
      <group>
        {/* ── the hung wall ─────────────────────────────────────────── */}
        {base(-1, p.wall)}
        {bands(-1, p.molding, 1.0)}
        {/* a shallow pilaster on every bay division, which is what gives the
            hung wall its rhythm and stops it reading as one long panel */}
        <Instanced
          count={d.bays + 1}
          place={(i, m) =>
            m.makeTranslation(-(d.halfWidth - 0.08), (sill + head) / 2, -i * d.bayDepth)
          }
        >
          <boxGeometry args={[0.16, head - sill, 0.34]} />
          <meshStandardMaterial color={p.molding} roughness={0.84} />
        </Instanced>
        {/* the dado: a panelled base with a moulded rail on top of it */}
        <mesh position={[-(d.halfWidth - 0.05), sill / 2, mid]}>
          <boxGeometry args={[0.1, sill, run]} />
          <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
        </mesh>
        <mesh position={[-(d.halfWidth - 0.09), sill, mid]}>
          <boxGeometry args={[0.2, 0.1, run]} />
          <meshStandardMaterial color={p.molding} roughness={0.8} />
        </mesh>

        {/* ── the glazed wall ───────────────────────────────────────── */}
        {/* the day itself: unshaded, so it stays the brightest surface in the
            room whatever the tone mapping is doing */}
        <Instanced
          count={nWindows}
          place={(i, m) => m.makeTranslation(d.halfWidth - 0.16, (sill + head) / 2, winZ(i))}
        >
          <boxGeometry args={[0.04, head - sill, pitch - 0.34]} />
          <meshBasicMaterial color={p.sky} toneMapped={false} />
        </Instanced>
        {/* the reveal each window sits in: a splayed stone jamb, which is what
            gives an opening its thickness */}
        {Array.from({ length: nWindows }, (_, i) => (
          <group key={`rev${i}`} position={[d.halfWidth - 0.1, 0, winZ(i)]}>
            {[-1, 1].map((e) => (
              <mesh key={e} position={[0, (sill + head) / 2, (e * (pitch - 0.34)) / 2]}>
                <boxGeometry args={[0.22, head - sill, 0.06]} />
                <meshStandardMaterial color={p.molding} roughness={0.82} />
              </mesh>
            ))}
            {/* the glazing bars: two lights across, four up */}
            <Instanced
              count={3}
              place={(j, m) =>
                m.makeTranslation(-0.09, sill + ((head - sill) * (j + 1)) / 4, 0)
              }
            >
              <boxGeometry args={[0.05, 0.035, pitch - 0.36]} />
              <meshStandardMaterial color={p.molding} roughness={0.7} />
            </Instanced>
            <mesh position={[-0.09, (sill + head) / 2, 0]}>
              <boxGeometry args={[0.05, head - sill, 0.035]} />
              <meshStandardMaterial color={p.molding} roughness={0.7} />
            </mesh>
          </group>
        ))}
        {/* the mullion between the openings — joinery, not architecture */}
        <Instanced
          count={nWindows + 1}
          castShadow
          place={(i, m) =>
            m.makeTranslation(d.halfWidth - 0.12, (sill + head) / 2, mid - run / 2 + i * pitch)
          }
        >
          <boxGeometry args={[0.2, head - sill, 0.32]} />
          <meshStandardMaterial color={p.molding} roughness={0.84} />
        </Instanced>
        {/* the sill, projecting, and the moulded architrave over the heads */}
        <mesh position={[d.halfWidth - 0.2, sill, mid]}>
          <boxGeometry args={[0.42, 0.13, run]} />
          <meshStandardMaterial color={p.molding} roughness={0.8} />
        </mesh>
        <mesh position={[d.halfWidth - 0.15, head + 0.09, mid]}>
          <boxGeometry args={[0.34, 0.18, run]} />
          <meshStandardMaterial color={p.molding} roughness={0.8} />
        </mesh>
        <mesh position={[d.halfWidth - 0.11, head + 0.22, mid]}>
          <boxGeometry args={[0.26, 0.07, run]} />
          <meshStandardMaterial color={p.gilt} metalness={0.5} roughness={0.5} />
        </mesh>
        {/* below the sill the wall is solid, paired with the dado opposite */}
        <mesh position={[d.halfWidth - 0.05, sill / 2, mid]}>
          <boxGeometry args={[0.12, sill, run]} />
          <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
        </mesh>
        {/* and above the architrave, back to plaster up to the beams */}
        <mesh
          position={[d.halfWidth, (head + 0.3 + d.wallHeight) / 2, mid]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[run, d.wallHeight - head - 0.3]} />
          <meshStandardMaterial color={p.wall} roughness={0.92} />
        </mesh>
        {bands(1, p.molding, 1.0)}

        {/* the sun on the floor, one patch per opening. Additive and soft: it
            is light landing on stone, not a decal of a rectangle. */}
        {Array.from({ length: nWindows }, (_, i) => (
          <mesh
            key={`sun${i}`}
            position={[d.halfWidth * 0.34, 0.02, winZ(i) - 0.5]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[d.halfWidth * 1.5, pitch * 0.72]} />
            <meshBasicMaterial
              map={glowTexture()}
              color={p.sky}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}

        {/* the portrait frieze, both walls, above everything */}
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
            <meshStandardMaterial color="#4A3524" roughness={0.72} />
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
