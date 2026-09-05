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
import { mapPanelTexture } from './fresco';

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
/** one course of the British Museum's banded stone floor, metres */
const BAND = 1.35;
/** one square of the Gallery of Maps' floor labyrinth, metres */
const MAZE = 3.2;

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
          : kind === 'stone-bands'
            ? 0.18
            : kind === 'parquet'
              ? 0.4
              : 0.5;
  const roughness =
    kind === 'court-paving'
      ? 0.5
      : kind === 'stone-bands'
        ? 0.62
        : kind === 'parquet'
          ? 0.3
          : kind === 'checkerboard'
            ? 0.12
            : 0.18;

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
            mixStrength={kind === 'court-paving' || kind === 'stone-bands' ? 0.3 : 0.6}
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
        /*
         * The Gallery of Maps' floor: a black and white labyrinth.
         *
         * Not a medallion and not a border — a bold interlocking maze of
         * thick bands, large squares inside larger squares with the corners
         * broken open, laid the width of the corridor and repeating down it.
         * It is the hardest, coldest thing in the room, and it is doing a
         * particular job: the vault above is an unbroken blaze of gold, and
         * without something equally rigid underfoot the whole corridor reads
         * as soft.
         *
         * Drawn as bands rather than as tiles. Only the dark marble is
         * geometry; the white is the polished plane showing through, so the
         * reflection of the vault runs across it unbroken — which is what
         * makes a floor look wet.
         */
        <group position={[0, 0, 0]}>
          {Array.from({ length: Math.ceil(run / MAZE) + 1 }, (_, cell) => {
            const z = -cell * MAZE;
            // one square-in-square, with the ring broken at the corners
            const rings = [0.88, 0.5];
            return (
              <group key={cell} position={[0, 0, z]}>
                {rings.map((k, ri) => {
                  const half = (MAZE * k) / 2;
                  const t = MAZE * 0.042;
                  return (
                    <group key={k}>
                      {/* the two bands across, and the two along */}
                      {[-1, 1].map((sy) => (
                        <mesh
                          key={`x${sy}`}
                          rotation={[-Math.PI / 2, 0, 0]}
                          position={[0, 0.005 + ri * 0.001, sy * half]}
                        >
                          <planeGeometry args={[half * 2 + t, t]} />
                          <meshStandardMaterial
                            color={p.floorInlay}
                            roughness={0.16}
                            metalness={0.2}
                          />
                        </mesh>
                      ))}
                      {[-1, 1].map((sx) => (
                        <mesh
                          key={`z${sx}`}
                          rotation={[-Math.PI / 2, 0, 0]}
                          position={[sx * half, 0.005 + ri * 0.001, 0]}
                        >
                          <planeGeometry args={[t, half * 2 - t * 1.6]} />
                          <meshStandardMaterial
                            color={p.floorInlay}
                            roughness={0.16}
                            metalness={0.2}
                          />
                        </mesh>
                      ))}
                    </group>
                  );
                })}
                {/* the key that ties one square into the next */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, MAZE / 2]}>
                  <planeGeometry args={[MAZE * 0.042, MAZE * 0.12]} />
                  <meshStandardMaterial color={p.floorInlay} roughness={0.16} metalness={0.2} />
                </mesh>
              </group>
            );
          })}
          {/* the dark border band down each edge of the walk */}
          {[-1, 1].map((sx) => (
            <mesh
              key={sx}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[sx * (d.halfWidth - 0.5), 0.005, mid]}
            >
              <planeGeometry args={[0.4, run]} />
              <meshStandardMaterial color={p.floorInlay} roughness={0.16} metalness={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {kind === 'promenade' && (
        // a wide central walkway with the galleries raised either side
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, mid]}>
          <planeGeometry args={[w * 0.46, run]} />
          <meshStandardMaterial color={p.floorInlay} roughness={0.28} metalness={0.1} />
        </mesh>
      )}

      {kind === 'stone-bands' && (
        /*
         * Wide bands of matte stone running ACROSS the hall.
         *
         * Not a grid and not a checkerboard: the Egyptian gallery's floor is
         * laid in broad courses that cross the width, alternating a chalky
         * mid grey with a dense charcoal, and that is most of why the room
         * reads as heavy. Bands across a corridor also do the opposite of what
         * a runner does — they measure the length out in front of you instead
         * of pulling you down it.
         *
         * Only the dark courses are drawn; the pale ones are the floor plane
         * showing through, which halves the geometry and keeps the specular
         * sheen continuous under them.
         */
        <group position={[0, 0.003, 0]}>
          <Instanced
            count={Math.ceil(run / (BAND * 2)) + 1}
            place={(i, m) => m.makeTranslation(0, 0, -i * BAND * 2)}
          >
            <boxGeometry args={[w, 0.004, BAND]} />
            <meshStandardMaterial color={p.floorInlay} roughness={0.62} metalness={0.06} />
          </Instanced>
          {/* the joint between courses: a hairline, darker than either */}
          <Instanced
            count={Math.ceil(run / BAND) + 1}
            place={(i, m) => {
              m.makeRotationX(-Math.PI / 2);
              m.setPosition(0, 0.006, -i * BAND);
            }}
          >
            <planeGeometry args={[w, 0.03]} />
            <meshStandardMaterial color={p.accent} roughness={0.8} />
          </Instanced>
        </group>
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

  if (kind === 'fluted-pilasters') {
    /*
     * The British Museum's Egyptian sculpture gallery.
     *
     * The room is not made of what is in it — the sculpture has been taken
     * out and it is still overwhelming — it is made of two things repeated
     * without variation for fifty metres: a fluted pilaster, and the flat
     * span of wall between two of them.
     *
     * The pilasters are ENGAGED, not free: thick rectangular shafts standing
     * only a third of a metre proud of the wall, cut with unbroken vertical
     * flutes from the plinth to the capital, and the capital is a plain
     * square block with no carving on it at all. That austerity is the whole
     * effect. A Corinthian capital here would make the hall decorative; a
     * heavy square one makes it structural, and the room reads as something
     * holding up a very great weight.
     *
     * Down one side, high above the hang, are the tall narrow windows —
     * behind translucent screens, so what comes through is a flat milky
     * daylight with no sun in it, and the shadows in the room are cast by the
     * ceiling rather than by the sky.
     */
    const flutes = 9;
    const pw = 1.45;
    const pd = 0.46;
    const capH = 0.62;
    const baseH = 0.5;
    const shaftTop = d.wallHeight - capH;
    /** the tall lights, above everything hung */
    const winBottom = Math.min(hangTop(d, style) + 0.5, d.wallHeight - 2.6);
    const winTop = d.wallHeight - capH - 0.35;
    const winW = 0.92;

    return (
      <group>
        {[-1, 1].map((side) => (
          <group key={side}>
            {base(side as 1 | -1, p.wall)}
            {/* the skirting: one heavy course, the only thing at floor level */}
            <mesh position={[side * (d.halfWidth - 0.07), 0.19, mid]} receiveShadow>
              <boxGeometry args={[0.14, 0.38, run]} />
              <meshStandardMaterial color={p.molding} roughness={0.86} />
            </mesh>

            {/* the shafts, one on every bay division */}
            <Instanced
              count={d.bays + 2}
              castShadow
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - pd / 2),
                  baseH + (shaftTop - baseH) / 2,
                  d.bayDepth - i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[pd, shaftTop - baseH, pw]} />
              <meshStandardMaterial color={p.molding} roughness={0.9} />
            </Instanced>

            {/*
             * The fluting. Seven channels to a shaft, drawn as recessed
             * half-round grooves rather than as ridges: a groove catches a
             * line of shadow along one side of itself, and it is that line,
             * repeated, that reads as fluting from across a hall.
             */}
            <Instanced
              count={(d.bays + 2) * flutes}
              place={(i, m) => {
                const bay = Math.floor(i / flutes);
                const f = i % flutes;
                m.makeRotationZ(Math.PI / 2);
                m.setPosition(
                  side * (d.halfWidth - pd - 0.015),
                  baseH + (shaftTop - baseH) / 2,
                  d.bayDepth - bay * d.bayDepth + (f / (flutes - 1) - 0.5) * pw * 0.82,
                );
              }}
            >
              <cylinderGeometry args={[0.075, 0.075, shaftTop - baseH, 10, 1, false, 0, Math.PI]} />
              <meshStandardMaterial color={p.wallDeep} roughness={0.95} />
            </Instanced>

            {/* the plinth under each shaft, and the plain square capital over
                it — heavier than the shaft, and completely unadorned */}
            <Instanced
              count={d.bays + 2}
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - pd / 2 - 0.04),
                  baseH / 2,
                  d.bayDepth - i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[pd + 0.08, baseH, pw + 0.12]} />
              <meshStandardMaterial color={p.molding} roughness={0.88} />
            </Instanced>
            <Instanced
              count={d.bays + 2}
              castShadow
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - pd / 2 - 0.05),
                  shaftTop + capH / 2,
                  d.bayDepth - i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[pd + 0.1, capH, pw + 0.16]} />
              <meshStandardMaterial color={p.molding} roughness={0.86} />
            </Instanced>

            {/* the entablature the capitals carry, running unbroken */}
            <mesh position={[side * (d.halfWidth - 0.12), d.wallHeight - 0.18, mid]} receiveShadow>
              <boxGeometry args={[0.3, 0.36, run]} />
              <meshStandardMaterial color={p.molding} roughness={0.88} />
            </mesh>
          </group>
        ))}

        {/*
         * The windows, high on the left wall only.
         *
         * One to a bay, between the pilasters, and screened: the pane is an
         * unshaded flat white so it stays the brightest thing in the room, and
         * the diffuse light it stands for is placed as a separate fixture (see
         * `daylight` in CorridorScene) rather than baked into the wall.
         */}
        {Array.from({ length: d.bays + 1 }, (_, i) => {
          const z = d.bayDepth / 2 - i * d.bayDepth;
          return (
            <group key={`win${i}`} position={[-(d.halfWidth - 0.09), (winBottom + winTop) / 2, z]}>
              <mesh>
                <boxGeometry args={[0.05, winTop - winBottom, winW]} />
                <meshBasicMaterial color={p.sky} toneMapped={false} />
              </mesh>
              {/* the screen over it: three horizontal bars and one mullion,
                  which is what stops a bright rectangle reading as a hole */}
              <Instanced
                count={3}
                place={(j, m) =>
                  m.makeTranslation(
                    -0.05,
                    ((j + 1) / 4 - 0.5) * (winTop - winBottom),
                    0,
                  )
                }
              >
                <boxGeometry args={[0.05, 0.05, winW]} />
                <meshStandardMaterial color={p.molding} roughness={0.8} />
              </Instanced>
              <mesh position={[-0.05, 0, 0]}>
                <boxGeometry args={[0.05, winTop - winBottom, 0.05]} />
                <meshStandardMaterial color={p.molding} roughness={0.8} />
              </mesh>
              {/* the splayed stone reveal round the opening */}
              {[-1, 1].map((e) => (
                <mesh key={e} position={[-0.03, 0, (e * (winW + 0.16)) / 2]}>
                  <boxGeometry args={[0.16, winTop - winBottom + 0.3, 0.16]} />
                  <meshStandardMaterial color={p.molding} roughness={0.86} />
                </mesh>
              ))}
              {[-1, 1].map((e) => (
                <mesh key={`h${e}`} position={[-0.03, (e * (winTop - winBottom + 0.16)) / 2, 0]}>
                  <boxGeometry args={[0.18, 0.16, winW + 0.3]} />
                  <meshStandardMaterial color={p.molding} roughness={0.86} />
                </mesh>
              ))}
            </group>
          );
        })}
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
    /*
     * The Vatican's Gallery of Maps.
     *
     * The walls here are the opposite of the British Museum's: no depth at
     * all. They are flat expanses divided into enormous rectangular panels,
     * each one a painted map in ocean blue and forest green, separated by
     * pilasters that are painted onto the wall rather than standing off it
     * and framed with bands of polished marble that run the whole length of
     * the corridor in an unbroken line.
     *
     * The maps are drawn rather than modelled — see ./fresco — and dealt out
     * so that no two neighbours are the same panel. Above them, on the window
     * side, is the clerestory the room is actually lit through.
     */
    const panelTop = d.wallHeight * 0.86;
    const panelBottom = 1.05;
    const panelH = panelTop - panelBottom;
    /** the side the windows are on: the maps opposite get the daylight */
    const winSide = 1;

    return (
      <group>
        {[-1, 1].map((side) => (
          <group key={side}>
            {base(side as 1 | -1, p.wallDeep)}
            {/* the dado the panels stand on */}
            <mesh position={[side * (d.halfWidth - 0.05), panelBottom / 2, mid]} receiveShadow>
              <boxGeometry args={[0.1, panelBottom, run]} />
              <meshStandardMaterial color={p.wall} roughness={0.86} />
            </mesh>
            <mesh position={[side * (d.halfWidth - 0.09), panelBottom, mid]}>
              <boxGeometry args={[0.18, 0.09, run]} />
              <meshStandardMaterial color={p.accent} roughness={0.3} metalness={0.16} />
            </mesh>

            {/* the maps themselves, one to a bay */}
            {Array.from({ length: d.bays + 1 }, (_, b) => {
              const z = d.bayDepth / 2 - b * d.bayDepth;
              const tex = mapPanelTexture(b * 2 + (side > 0 ? 1 : 0));
              return (
                <mesh
                  key={`m${b}`}
                  position={[side * (d.halfWidth - 0.04), (panelBottom + panelTop) / 2, z]}
                  rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
                >
                  <planeGeometry args={[d.bayDepth * 0.78, panelH]} />
                  <meshStandardMaterial
                    color={tex ? '#FFFFFF' : p.accent}
                    map={tex}
                    roughness={0.86}
                  />
                </mesh>
              );
            })}

            {/* the flat pilasters between them: painted, barely proud of the
                wall, with a marble band either side of each */}
            <Instanced
              count={d.bays + 2}
              place={(i, m) =>
                m.makeTranslation(
                  side * (d.halfWidth - 0.05),
                  (panelBottom + panelTop) / 2,
                  d.bayDepth - i * d.bayDepth,
                )
              }
            >
              <boxGeometry args={[0.09, panelH, d.bayDepth * 0.2]} />
              <meshStandardMaterial color={p.wall} roughness={0.8} />
            </Instanced>
            <Instanced
              count={(d.bays + 2) * 2}
              place={(i, m) => {
                const bay = Math.floor(i / 2);
                m.makeTranslation(
                  side * (d.halfWidth - 0.1),
                  (panelBottom + panelTop) / 2,
                  d.bayDepth - bay * d.bayDepth + (i % 2 ? 1 : -1) * d.bayDepth * 0.1,
                );
              }}
            >
              <boxGeometry args={[0.12, panelH, 0.07]} />
              <meshStandardMaterial color={p.accent} roughness={0.3} metalness={0.16} />
            </Instanced>

            {/* the marble trim above and below the run of panels, unbroken */}
            {[panelBottom - 0.06, panelTop + 0.06].map((y) => (
              <mesh key={y} position={[side * (d.halfWidth - 0.1), y, mid]}>
                <boxGeometry args={[0.14, 0.12, run]} />
                <meshStandardMaterial color={p.accent} roughness={0.3} metalness={0.16} />
              </mesh>
            ))}
            {/* and the frieze between the trim and the cornice */}
            <mesh
              position={[side * (d.halfWidth - 0.03), (panelTop + d.wallHeight) / 2 + 0.06, mid]}
              rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <planeGeometry args={[run, d.wallHeight - panelTop - 0.12]} />
              <meshStandardMaterial color={p.wall} roughness={0.88} />
            </mesh>
          </group>
        ))}

        {/*
         * The clerestory on the window side: tall openings in the frieze,
         * unshaded, which is where the hard white reflections on the floor
         * come from.
         */}
        {Array.from({ length: d.bays + 1 }, (_, b) => (
          <mesh
            key={`w${b}`}
            position={[
              winSide * (d.halfWidth - 0.06),
              (panelTop + d.wallHeight) / 2 + 0.06,
              d.bayDepth / 2 - b * d.bayDepth,
            ]}
          >
            <boxGeometry args={[0.05, (d.wallHeight - panelTop) * 0.5, d.bayDepth * 0.42]} />
            <meshBasicMaterial color={p.sky} toneMapped={false} />
          </mesh>
        ))}

        {/* the day landing on that glassy floor, one pool per opening */}
        {Array.from({ length: d.bays + 1 }, (_, b) => (
          <mesh
            key={`sun${b}`}
            position={[winSide * d.halfWidth * 0.3, 0.02, d.bayDepth / 2 - b * d.bayDepth - 0.6]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[d.halfWidth * 1.4, d.bayDepth * 0.8]} />
            <meshBasicMaterial
              map={glowTexture()}
              color={p.sky}
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
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
