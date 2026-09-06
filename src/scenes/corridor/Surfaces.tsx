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

  if (kind === 'stone-colonnade') {
    /*
     * The British Museum's Egyptian sculpture gallery, at the end of the day.
     *
     * The room is two things repeated without variation: a colossal column,
     * and the span of wall between two of them. The columns are FREE-STANDING
     * — a full drum's width off the wall, floor to ceiling — which is the
     * difference between a hall you walk through and a corridor you walk
     * down: you see the length of the room past them, and the hang between
     * them, framed.
     *
     * They stand on the bay DIVISIONS, never in a bay centre, because a
     * column in front of a painting is a column that has ruined the painting.
     * Everything else in here obeys the same rule — the benches are on the
     * centre line, the windows are above head height, and nothing at all
     * stands in the eight metres between the two colonnades.
     *
     * The wall behind them is sand, not stone-white. Every warm source in the
     * room lands on it, and a white wall under a sunset reads as a white wall
     * that somebody has lit orange rather than as evening.
     */
    const nCol = d.bays + 1;
    const colX = d.halfWidth - 1.05;
    const baseH = 0.62;
    const capH = 0.66;
    const shaftH = d.wallHeight - baseH - capH;
    const rBot = 0.34;
    const rTop = 0.29;
    const flutes = 20;

    /** the openings, high on the left and much larger than they were */
    const winBottom = Math.min(hangTop(d, style) + 0.35, d.wallHeight - 3.1);
    const winTop = d.wallHeight - 0.75;
    const winW = d.bayDepth * 0.52;

    /** one instanced ring of column parts, placed at every division */
    const atColumns = (y: number, side: number) => (i: number, m: THREE.Matrix4) =>
      m.makeTranslation(side * colX, y, -i * d.bayDepth);

    return (
      <group>
        {[-1, 1].map((side) => (
          <group key={side}>
            {base(side as 1 | -1, p.wall)}
            {/* a heavy plinth course along the foot of the wall */}
            <mesh position={[side * (d.halfWidth - 0.08), 0.24, mid]} receiveShadow>
              <boxGeometry args={[0.16, 0.48, run]} />
              <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
            </mesh>
            {/* and the entablature the ceiling lands on */}
            <mesh position={[side * (d.halfWidth - 0.12), d.wallHeight - 0.2, mid]} receiveShadow>
              <boxGeometry args={[0.3, 0.4, run]} />
              <meshStandardMaterial color={p.molding} roughness={0.88} />
            </mesh>

            {/* ── the colonnade ───────────────────────────────────────── */}
            {/* the shaft, very slightly tapered: a cylinder of even width
                reads as a pipe, and the taper is the whole reason a stone
                column looks like it is carrying something */}
            <Instanced count={nCol} castShadow place={atColumns(baseH + shaftH / 2, side)}>
              <cylinderGeometry args={[rTop, rBot, shaftH, 24]} />
              <meshStandardMaterial color={p.molding} roughness={0.86} />
            </Instanced>
            {/* the flutes, cut round the shaft */}
            <Instanced
              count={nCol * flutes}
              place={(i, m) => {
                const col = Math.floor(i / flutes);
                const f = i % flutes;
                const a = (f / flutes) * Math.PI * 2;
                m.makeTranslation(
                  side * colX + Math.cos(a) * (rBot - 0.02),
                  baseH + shaftH / 2,
                  -col * d.bayDepth + Math.sin(a) * (rBot - 0.02),
                );
              }}
            >
              <cylinderGeometry args={[0.045, 0.045, shaftH * 0.99, 8]} />
              <meshStandardMaterial color={p.wallDeep} roughness={0.94} />
            </Instanced>

            {/* the Attic base: square plinth, torus, fillet */}
            <Instanced count={nCol} place={atColumns(0.1, side)}>
              <boxGeometry args={[rBot * 2.5, 0.2, rBot * 2.5]} />
              <meshStandardMaterial color={p.molding} roughness={0.88} />
            </Instanced>
            <Instanced count={nCol} place={atColumns(0.3, side)}>
              <cylinderGeometry args={[rBot * 1.28, rBot * 1.34, 0.22, 20]} />
              <meshStandardMaterial color={p.molding} roughness={0.84} />
            </Instanced>
            <Instanced count={nCol} place={atColumns(0.48, side)}>
              <cylinderGeometry args={[rBot * 1.08, rBot * 1.2, 0.14, 20]} />
              <meshStandardMaterial color={p.molding} roughness={0.84} />
            </Instanced>
            {/* The apophyge: the flare where the shaft grows out of its base.
                Without it the base stack stops at 0.55 and the shaft starts at
                0.62, and a column with a seven-centimetre gap in it does not
                look like it is standing on anything. */}
            <Instanced count={nCol} place={atColumns(0.58, side)}>
              <cylinderGeometry args={[rBot, rBot * 1.1, 0.12, 20]} />
              <meshStandardMaterial color={p.molding} roughness={0.86} />
            </Instanced>

            {/* the necking ring, then the capital: echinus, volutes, abacus */}
            <Instanced count={nCol} place={atColumns(baseH + shaftH + 0.04, side)}>
              <cylinderGeometry args={[rTop * 1.1, rTop * 1.04, 0.1, 20]} />
              <meshStandardMaterial color={p.molding} roughness={0.82} />
            </Instanced>
            <Instanced count={nCol} castShadow place={atColumns(baseH + shaftH + 0.26, side)}>
              <cylinderGeometry args={[rTop * 1.62, rTop * 1.12, 0.34, 20]} />
              <meshStandardMaterial color={p.molding} roughness={0.8} />
            </Instanced>
            {/* the volutes: two scrolls facing down the hall, which is the one
                piece of carving legible from the far end of a fifty-metre room */}
            <Instanced
              count={nCol * 2}
              place={(i, m) => {
                const col = Math.floor(i / 2);
                m.makeRotationX(Math.PI / 2);
                m.setPosition(
                  side * colX + (i % 2 ? 1 : -1) * rTop * 1.5,
                  baseH + shaftH + 0.3,
                  -col * d.bayDepth,
                );
              }}
            >
              <cylinderGeometry args={[0.15, 0.15, 0.12, 16]} />
              <meshStandardMaterial color={p.molding} roughness={0.78} />
            </Instanced>
            <Instanced count={nCol} castShadow place={atColumns(baseH + shaftH + 0.5, side)}>
              <boxGeometry args={[rTop * 3.1, 0.16, rTop * 3.1]} />
              <meshStandardMaterial color={p.molding} roughness={0.8} />
            </Instanced>
          </group>
        ))}

        {/*
         * The windows: tall, wide, and high enough that nothing hung can be
         * behind one. What comes through them at this hour is not daylight —
         * it is low sun, and everything about how this room looks follows from
         * that, so the glazing is a warm unshaded plane rather than a white
         * one.
         */}
        {Array.from({ length: d.bays + 1 }, (_, i) => {
          const z = d.bayDepth / 2 - i * d.bayDepth;
          const h = winTop - winBottom;
          return (
            <group key={`win${i}`} position={[-(d.halfWidth - 0.1), (winBottom + winTop) / 2, z]}>
              <mesh>
                <boxGeometry args={[0.06, h, winW]} />
                <meshBasicMaterial color={p.sky} toneMapped={false} />
              </mesh>
              {/* the glazing bars */}
              <Instanced
                count={3}
                place={(j, m) => m.makeTranslation(-0.06, ((j + 1) / 4 - 0.5) * h, 0)}
              >
                <boxGeometry args={[0.05, 0.05, winW]} />
                <meshStandardMaterial color={p.molding} roughness={0.8} />
              </Instanced>
              <mesh position={[-0.06, 0, 0]}>
                <boxGeometry args={[0.05, h, 0.05]} />
                <meshStandardMaterial color={p.molding} roughness={0.8} />
              </mesh>
              {/* the stone surround */}
              {[-1, 1].map((e) => (
                <mesh key={e} position={[-0.04, 0, (e * (winW + 0.24)) / 2]}>
                  <boxGeometry args={[0.2, h + 0.4, 0.24]} />
                  <meshStandardMaterial color={p.molding} roughness={0.86} />
                </mesh>
              ))}
              {[-1, 1].map((e) => (
                <mesh key={`h${e}`} position={[-0.04, (e * (h + 0.22)) / 2, 0]}>
                  <boxGeometry args={[0.24, 0.22, winW + 0.5]} />
                  <meshStandardMaterial color={p.molding} roughness={0.86} />
                </mesh>
              ))}
            </group>
          );
        })}

        {/*
         * The sun coming in.
         *
         * Four soft slabs per window, leaning across the hall at the angle a
         * low sun makes, added rather than blended, plus the patch each one
         * lands in on the floor. It is not volumetric light and does not
         * pretend to be — it is the shape light makes in dusty air, drawn.
         *
         * They live entirely on the window side of the room and stop short of
         * the far colonnade, so a ray never crosses a canvas.
         */}
        {Array.from({ length: d.bays + 1 }, (_, i) => {
          const z = d.bayDepth / 2 - i * d.bayDepth;
          const beamL = d.halfWidth * 1.5;
          return (
            <group key={`ray${i}`}>
              {[0, 1, 2].map((k) => (
                <mesh
                  key={k}
                  position={[
                    -d.halfWidth + beamL * 0.42,
                    winBottom - 0.6 - k * 0.28,
                    z + (k - 1) * winW * 0.3,
                  ]}
                  rotation={[0, 0, -0.42]}
                >
                  <planeGeometry args={[beamL, winW * (0.5 - k * 0.08)]} />
                  <meshBasicMaterial
                    map={glowTexture()}
                    color={style.light.key}
                    transparent
                    opacity={0.075}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                  />
                </mesh>
              ))}
              {/* where it lands */}
              <mesh
                position={[-d.halfWidth * 0.1, 0.02, z - d.bayDepth * 0.15]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[d.halfWidth * 1.7, d.bayDepth * 0.8]} />
                <meshBasicMaterial
                  map={glowTexture()}
                  color={style.light.key}
                  transparent
                  opacity={0.16}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
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

        {/*
         * The sun coming in, and where it lands.
         *
         * The sky outside is blue and the light inside is not: what comes
         * through a window at midday is warm by the time it has crossed a
         * plastered room, and painting the floor pools the colour of the sky
         * turns a Florentine corridor into a swimming pool. So the glazing
         * takes the palette's sky and everything the light touches takes the
         * key, which is the room's own warmth.
         *
         * The shafts are steep, because it is midday and the sun is high.
         */}
        {Array.from({ length: nWindows }, (_, i) => (
          <group key={`sun${i}`}>
            {[0, 1].map((k) => (
              <mesh
                key={k}
                position={[d.halfWidth - 0.9 - k * 0.5, (sill + head) / 2 - 0.4, winZ(i)]}
                rotation={[0, 0, 0.34 + k * 0.05]}
              >
                <planeGeometry args={[1.9, (head - sill) * (0.86 - k * 0.12)]} />
                <meshBasicMaterial
                  map={glowTexture()}
                  color={style.light.key}
                  transparent
                  opacity={0.1}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
            ))}
            <mesh
              position={[d.halfWidth * 0.34, 0.02, winZ(i) - 0.5]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[d.halfWidth * 1.5, pitch * 0.72]} />
              <meshBasicMaterial
                map={glowTexture()}
                color={style.light.key}
                transparent
                opacity={0.42}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
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

            {/*
             * The maps, one to a bay — except where a painting hangs.
             *
             * A canvas in front of a wall map is two pictures in the same
             * place, and the map wins: it is bigger, it is busier, and it is
             * directly behind the thing you are meant to be looking at. So the
             * bay that carries a work gets a plain plastered field with a
             * marble border instead, which is what the room does anyway when
             * it hangs something over a panel.
             */}
            {Array.from({ length: d.bays + 2 }, (_, i) => {
              const b = i - 1;
              const z = bayZ(d, b);
              const hung = b >= 0 && b < d.bays && (b % 2 === 0 ? side > 0 : side < 0);
              const tex = hung ? null : mapPanelTexture(b * 2 + (side > 0 ? 1 : 0));
              return (
                <group key={`m${i}`}>
                  <mesh
                    position={[side * (d.halfWidth - 0.04), (panelBottom + panelTop) / 2, z]}
                    rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  >
                    <planeGeometry args={[d.bayDepth * 0.78, panelH]} />
                    <meshStandardMaterial
                      color={tex ? '#FFFFFF' : p.wall}
                      map={tex}
                      roughness={0.86}
                    />
                  </mesh>
                  {/* the border round a blank field, so it reads as a bay of
                      the same wall rather than as a gap in the maps */}
                  {hung &&
                    [-1, 1].map((e) => (
                      <mesh
                        key={e}
                        position={[
                          side * (d.halfWidth - 0.08),
                          (panelBottom + panelTop) / 2,
                          z + (e * d.bayDepth * 0.78) / 2,
                        ]}
                      >
                        <boxGeometry args={[0.1, panelH, 0.06]} />
                        <meshStandardMaterial color={p.accent} roughness={0.3} metalness={0.16} />
                      </mesh>
                    ))}
                </group>
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
