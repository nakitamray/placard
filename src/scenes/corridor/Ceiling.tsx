/**
 * The roof over each corridor.
 *
 * This is the single most identifying feature of a museum interior — before
 * you read a label you know which building you are standing in from what is
 * above you — so each museum gets its own construction rather than a tinted
 * copy of one vault.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { grotesqueTexture } from './grotesque';
import { glowTexture } from './glow';
import { vaultFrescoTexture } from './fresco';
import type { MuseumStyle } from '../../types';
import { bayZ, type Dims } from './dims';

interface Props {
  style: MuseumStyle;
  d: Dims;
}

/** repeated ribs, purlins and mullions are always instanced */
function Repeated({
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
    // The dependency array matters: without it this rewrites every instance
    // matrix on every React render, which for a wall of several thousand
    // bricks is thousands of Matrix4 writes each time anything re-renders.
  }, [count, place]);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      {children}
    </instancedMesh>
  );
}

/* ── Louvre: white barrel vault pierced by arched skylights ─────────────── */

function BarrelSkylight({ style, d }: Props) {
  const p = style.palette;
  const r = d.halfWidth;
  const springing = d.wallHeight;
  const mid = -d.length / 2;

  return (
    <group>
      {/* the vault itself — the brightest large surface in the room */}
      <mesh position={[0, springing, mid]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[r, r, d.length + d.bayDepth * 3, 48, 1, true, Math.PI / 2, Math.PI]}
        />
        <meshStandardMaterial color={p.ceiling} roughness={0.9} side={THREE.BackSide} />
      </mesh>

      {/* thick classical molding where the vault springs from the wall — the
          heavy white band that separates ceiling from wall in every Louvre
          painting gallery */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (r - 0.09), springing - 0.16, mid]}>
            <boxGeometry args={[0.34, 0.32, d.length + d.bayDepth * 3]} />
            <meshStandardMaterial color={p.molding} roughness={0.72} />
          </mesh>
          <mesh position={[side * (r - 0.26), springing - 0.46, mid]}>
            <boxGeometry args={[0.2, 0.3, d.length + d.bayDepth * 3]} />
            <meshStandardMaterial color={p.molding} roughness={0.76} />
          </mesh>
        </group>
      ))}

      {/* the skylights: an arched opening at the crown of every bay */}
      {Array.from({ length: d.bays }, (_, b) => {
        const z = bayZ(d, b);
        return (
          <group key={b} position={[0, 0, z]}>
            <mesh position={[0, springing + r - 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[r * 0.92, d.bayDepth * 0.62]} />
              <meshBasicMaterial color={p.sky} toneMapped={false} />
            </mesh>
            {/* glazing bars across the opening */}
            {[-0.28, 0, 0.28].map((f) => (
              <mesh key={f} position={[0, springing + r - 0.08, f * d.bayDepth]}>
                <boxGeometry args={[r * 0.94, 0.07, 0.07]} />
                <meshStandardMaterial color={p.molding} roughness={0.8} />
              </mesh>
            ))}
            {/* the coffered surround of the opening */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * r * 0.48, springing + r - 0.12, 0]}>
                <boxGeometry args={[0.14, 0.24, d.bayDepth * 0.68]} />
                <meshStandardMaterial color={p.molding} roughness={0.75} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* transverse ribs at every bay division */}
      <Repeated
        count={d.bays + 1}
        place={(i, m) => m.makeTranslation(0, springing, -i * d.bayDepth)}
      >
        <torusGeometry args={[r - 0.04, 0.085, 8, 26, Math.PI]} />
        <meshStandardMaterial color={p.molding} roughness={0.74} />
      </Repeated>
    </group>
  );
}

/* ── National Gallery: pitched glass lantern on gilded arches ───────────── */

function PitchedGlass({ style, d }: Props) {
  const p = style.palette;
  const r = d.halfWidth;
  const eaves = d.wallHeight + 1.1;
  const ridge = d.vaultHeight;
  const slope = Math.atan2(ridge - eaves, r * 0.62);
  const slopeLen = Math.hypot(ridge - eaves, r * 0.62);
  const mid = -d.length / 2;
  const runLength = d.length + d.bayDepth * 3;

  return (
    <group>
      {/* The two glazed slopes of the lantern.
          A PlaneGeometry lies in its own XY, so its second dimension runs
          *up* unless it is laid down first. The group carries the slope and
          the mesh's own -90° about X lays the plane along the corridor;
          rotating only about Z would stand a 50-metre sheet of glass on end
          across the room. */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[(side * r * 0.62) / 2, (eaves + ridge) / 2, mid]}
          rotation={[0, 0, -side * slope]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[slopeLen, runLength]} />
            <meshBasicMaterial color={p.sky} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* white structural ribs across the glass, one pair per half-bay */}
      <Repeated
        count={(d.bays + 1) * 2}
        place={(i, m) => {
          const side = i % 2 ? 1 : -1;
          const z = -(i >> 1) * d.bayDepth;
          m.makeRotationZ(-side * slope);
          m.setPosition((side * r * 0.62) / 2, (eaves + ridge) / 2, z);
        }}
      >
        <boxGeometry args={[slopeLen, 0.1, 0.1]} />
        <meshStandardMaterial color={p.ceiling} roughness={0.7} />
      </Repeated>
      {/* ridge beam */}
      <mesh position={[0, ridge, mid]}>
        <boxGeometry args={[0.22, 0.2, runLength]} />
        <meshStandardMaterial color={p.ceiling} roughness={0.7} />
      </mesh>

      {/* the coved ceiling below the lantern: warm red and gold sections
          divided by gilded arches */}
      {[-1, 1].map((side) => (
        <group
          key={`cove${side}`}
          position={[side * (r * 0.62 + (r - r * 0.62) / 2), eaves - 0.35, mid]}
          rotation={[0, 0, side * -0.55]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[(r - r * 0.62) * 1.5, runLength]} />
            <meshStandardMaterial
              color={p.ceilingAccent}
              roughness={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {/* the intricate gilded archways between vault sections */}
      <Repeated
        count={d.bays + 1}
        place={(i, m) => m.makeTranslation(0, eaves - 0.9, -i * d.bayDepth)}
      >
        <torusGeometry args={[r - 0.05, 0.13, 8, 28, Math.PI]} />
        <meshStandardMaterial color={p.gilt} metalness={0.8} roughness={0.35} />
      </Repeated>
      {/* gilt eaves cornice running the length of both walls */}
      {[-1, 1].map((side) => (
        <mesh key={`e${side}`} position={[side * (r - 0.12), eaves - 0.55, mid]}>
          <boxGeometry args={[0.3, 0.3, runLength]} />
          <meshStandardMaterial color={p.gilt} metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Two colours, blended.
 *
 * Used to bake the occlusion a coffer would cast into the colour of the
 * coffer, which is the only way a recess a few centimetres deep reads as deep
 * from four metres below it.
 */
function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/**
 * The Vatican's Gallery of Maps: a barrel vault encrusted end to end.
 *
 * The single most decorated surface in the exhibition, and the one that
 * cannot be modelled. The real vault is a continuous topography of sculpted
 * plaster — figures, vines, cartouches, deep ornate borders — acting as heavy
 * frames for a hundred painted scenes, the whole of it gilded and running
 * unbroken for a hundred and twenty metres.
 *
 * So the fresco is PAINTED (see ./fresco): one bay of gold ground, painted
 * compartments and grotesque borders, drawn into a canvas at load and tiled
 * along the vault. What stays modelled is only what has to catch a moving
 * highlight — the transverse ribs, the longitudinal bands and the cornice —
 * because gilding is specular, and a texture of gold under a lamp reads as
 * yellow paint the moment the camera moves.
 *
 * THE LIGHT COMES FROM THE CORNICE, UPWARD. That is the actual lighting of
 * that gallery and the reason it glows: a continuous warm source hidden at
 * the top of the walls, throwing light up into the vault so the raised stucco
 * casts its shadows downward and every carved thing pops. A lamp hung in the
 * middle of the room would flatten the entire ceiling.
 */
function FrescoVault({ style, d }: Props) {
  const p = style.palette;
  const r = d.halfWidth;
  const springing = d.wallHeight;
  const mid = -d.length / 2;
  const runLength = d.length + d.bayDepth * 3;

  const fresco = useMemo(
    () => vaultFrescoTexture(Math.round(runLength / d.bayDepth)),
    [runLength, d.bayDepth],
  );

  return (
    <group>
      {/* the painted vault */}
      <mesh position={[0, springing, mid]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, runLength, 48, 1, true, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial
          color={fresco ? '#FFFFFF' : p.ceiling}
          map={fresco}
          roughness={0.72}
          metalness={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* the transverse ribs: heavy gilt half-hoops on every bay division */}
      <Repeated
        count={d.bays + 3}
        place={(i, m) => m.makeTranslation(0, springing, d.bayDepth - i * d.bayDepth)}
      >
        <torusGeometry args={[r - 0.04, 0.17, 10, 28, Math.PI]} />
        <meshStandardMaterial color={p.molding} metalness={0.78} roughness={0.3} />
      </Repeated>
      {/* and a thinner one just inside each, which is what gives a carved
          border its double line from the floor */}
      <Repeated
        count={d.bays + 3}
        place={(i, m) => m.makeTranslation(0, springing, d.bayDepth - i * d.bayDepth + 0.34)}
      >
        <torusGeometry args={[r - 0.05, 0.07, 8, 24, Math.PI]} />
        <meshStandardMaterial color={p.gilt} metalness={0.8} roughness={0.28} />
      </Repeated>

      {/* the longitudinal bands running the length of the vault */}
      {[-0.72, -0.36, 0, 0.36, 0.72].map((f) => {
        const a = (f * Math.PI) / 2;
        const thick = Math.abs(f) < 0.01 ? 0.2 : 0.13;
        return (
          <mesh
            key={f}
            position={[Math.sin(a) * (r - 0.06), springing + Math.cos(a) * (r - 0.06), mid]}
            rotation={[0, 0, -a]}
          >
            <boxGeometry args={[thick, thick, runLength]} />
            <meshStandardMaterial color={p.molding} metalness={0.74} roughness={0.34} />
          </mesh>
        );
      })}

      {/* raised bosses where the ribs cross the bands: the one piece of the
          stucco big enough to read as sculpture rather than as pattern */}
      <Repeated
        count={(d.bays + 3) * 2}
        place={(i, m) => {
          const bay = Math.floor(i / 2);
          const a = ((i % 2 ? 0.36 : -0.36) * Math.PI) / 2;
          m.makeTranslation(
            Math.sin(a) * (r - 0.14),
            springing + Math.cos(a) * (r - 0.14),
            d.bayDepth - bay * d.bayDepth,
          );
        }}
      >
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={p.gilt} metalness={0.82} roughness={0.26} />
      </Repeated>

      {/* the gilt cornice at the springing, both sides */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (r - 0.08), springing - 0.14, mid]}>
            <boxGeometry args={[0.3, 0.4, runLength]} />
            <meshStandardMaterial color={p.molding} metalness={0.66} roughness={0.38} />
          </mesh>
          {/* the hidden source: a band of warm light on the cornice itself,
              unshaded, so the top of the wall glows the way it does in the
              room. The lights that actually throw it up into the vault are
              placed with the rest of the rig — see Lamps. */}
          <mesh position={[side * (r - 0.2), springing - 0.02, mid]}>
            <boxGeometry args={[0.1, 0.07, runLength]} />
            <meshBasicMaterial color={p.sky} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Orsay: the train shed — colossal arched steel and glass ────────────── */

function SteelGlassArch({ style, d }: Props) {
  const p = style.palette;
  const r = d.halfWidth;
  const springing = d.wallHeight;
  const mid = -d.length / 2;

  return (
    <group>
      {/* glazing between the arches */}
      <mesh position={[0, springing, mid]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[r, r, d.length + d.bayDepth * 3, 40, 1, true, Math.PI / 2, Math.PI]}
        />
        <meshBasicMaterial color={p.ceiling} toneMapped={false} side={THREE.BackSide} />
      </mesh>

      {/* The day coming through it, landing on the floor.
          A glazed vault whose only evidence is a bright ceiling reads as a lit
          panel; what says "roof" is the light arriving underneath it. One soft
          pool per bay, offset from the centre line the way the sun is offset
          from the ridge, added rather than painted. */}
      {Array.from({ length: d.bays }, (_, b) => (
        <mesh
          key={`shaft${b}`}
          position={[d.halfWidth * 0.2, 0.02, bayZ(d, b) + d.bayDepth * 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[d.halfWidth * 1.5, d.bayDepth * 0.9]} />
          <meshBasicMaterial
            map={glowTexture()}
            color={p.sky}
            transparent
            opacity={0.22}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* the great arched ribs, closely spaced — two per bay */}
      <Repeated
        count={d.bays * 2 + 1}
        place={(i, m) => m.makeTranslation(0, springing, (-i * d.bayDepth) / 2)}
      >
        <torusGeometry args={[r - 0.02, 0.11, 8, 30, Math.PI]} />
        <meshStandardMaterial color={p.ceilingAccent} metalness={0.55} roughness={0.5} />
      </Repeated>

      {/* longitudinal purlins tying the ribs together */}
      {[-0.78, -0.4, 0, 0.4, 0.78].map((f) => {
        const a = (f * Math.PI) / 2;
        return (
          <mesh
            key={f}
            position={[Math.sin(a) * (r - 0.1), springing + Math.cos(a) * (r - 0.1), mid]}
          >
            <boxGeometry args={[0.08, 0.08, d.length + d.bayDepth * 3]} />
            <meshStandardMaterial color={p.ceilingAccent} metalness={0.5} roughness={0.55} />
          </mesh>
        );
      })}

      {/* deep carved-stone cornice where the roof meets the walls */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (r - 0.14), springing - 0.3, mid]}>
          <boxGeometry args={[0.42, 0.6, d.length + d.bayDepth * 3]} />
          <meshStandardMaterial color={p.molding} roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

/* ── The Met: a peaked skylight over what reads as an outdoor court ─────── */

function PeakedCourt({ style, d }: Props) {
  const p = style.palette;
  const r = d.halfWidth;
  const eaves = d.wallHeight;
  const ridge = d.vaultHeight;
  // the peak covers the middle of the court; a lower flat run of glazing
  // carries on from the eaves to the walls, as it does over the real court
  const peakHalf = r * 0.66;
  const slope = Math.atan2(ridge - eaves, peakHalf);
  const slopeLen = Math.hypot(ridge - eaves, peakHalf);
  const mid = -d.length / 2;
  const runLength = d.length + d.bayDepth * 3;
  /** glazing bars every ~1.3m, which is what makes the roof read as glass */
  const barsPerBay = Math.max(3, Math.round(d.bayDepth / 1.3));
  const barCount = d.bays * barsPerBay + 1;
  const glazingStep = runLength / barCount;

  return (
    <group>
      {/* The glazed slopes. Emissive rather than lit: a skylight is the light
          source in the room, and a shaded surface up there reads as a painted
          ceiling instead of as open sky. */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[(side * peakHalf) / 2, (eaves + ridge) / 2, mid]}
          rotation={[0, 0, -side * slope]}
        >
          {/* laid along the corridor by the mesh, tilted by the group — see
              the note on the National Gallery lantern */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[slopeLen, runLength]} />
            <meshBasicMaterial color={p.sky} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/*
       * The sun through it.
       *
       * A skylight that is only a bright surface reads as a lit ceiling. What
       * says roof is the light arriving underneath it: two leaning shafts a
       * bay, running from the ridge down to the floor on the sunward side,
       * and the pool each one lands in. Additive, soft-edged and faint — this
       * is a glazed court at midday, not a cathedral.
       */}
      {Array.from({ length: d.bays }, (_, b) => (
        <group key={`shaft${b}`}>
          {[0, 1].map((k) => (
            <mesh
              key={k}
              position={[
                -d.halfWidth * (0.15 + k * 0.16),
                (eaves + ridge) * 0.32,
                bayZ(d, b) + (k - 0.5) * d.bayDepth * 0.3,
              ]}
              rotation={[0, 0, 0.3 + k * 0.06]}
            >
              <planeGeometry args={[2.6 - k * 0.5, ridge * 1.35]} />
              <meshBasicMaterial
                map={glowTexture()}
                color={style.light.key}
                transparent
                opacity={0.028}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
          ))}
          <mesh
            position={[-d.halfWidth * 0.3, 0.02, bayZ(d, b) + d.bayDepth * 0.1]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[d.halfWidth * 1.3, d.bayDepth * 0.85]} />
            <meshBasicMaterial
              map={glowTexture()}
              color={style.light.key}
              transparent
              opacity={0.1}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* the lower flat glazing, eaves to wall head, both sides */}
      {[-1, 1].map((side) => (
        <mesh
          key={`flat${side}`}
          position={[side * ((peakHalf + r) / 2), eaves - 0.06, mid]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[r - peakHalf, runLength]} />
          <meshBasicMaterial color={p.ceiling} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Glazing bars across both slopes and both flat runs — the dense white
          grid is the single most recognisable thing about this roof. */}
      <Repeated
        count={barCount * 2}
        place={(i, m) => {
          const side = i % 2 ? 1 : -1;
          const z = -(i >> 1) * glazingStep * 2;
          m.makeRotationZ(-side * slope);
          m.setPosition((side * peakHalf) / 2, (eaves + ridge) / 2, z);
        }}
      >
        <boxGeometry args={[slopeLen, 0.07, 0.07]} />
        <meshStandardMaterial color={p.ceilingAccent} roughness={0.55} />
      </Repeated>
      <Repeated
        count={barCount * 2}
        place={(i, m) => {
          const side = i % 2 ? 1 : -1;
          const z = -(i >> 1) * glazingStep * 2;
          m.makeTranslation(side * ((peakHalf + r) / 2), eaves - 0.04, z);
        }}
      >
        <boxGeometry args={[r - peakHalf, 0.07, 0.07]} />
        <meshStandardMaterial color={p.ceilingAccent} roughness={0.55} />
      </Repeated>

      {/* longitudinal purlins running the length of each slope */}
      {[-1, 1].map((side) =>
        [0.3, 0.62, 0.9].map((t) => (
          <mesh
            key={`pu${side}${t}`}
            position={[
              side * peakHalf * t,
              ridge - (ridge - eaves) * t,
              mid,
            ]}
          >
            <boxGeometry args={[0.06, 0.06, runLength]} />
            <meshStandardMaterial color={p.ceilingAccent} roughness={0.55} />
          </mesh>
        )),
      )}

      {/* ridge beam and eaves fascias */}
      <mesh position={[0, ridge, mid]}>
        <boxGeometry args={[0.22, 0.2, runLength]} />
        <meshStandardMaterial color={p.ceilingAccent} roughness={0.5} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`fa${side}`} position={[side * peakHalf, eaves - 0.02, mid]}>
          <boxGeometry args={[0.16, 0.22, runLength]} />
          <meshStandardMaterial color={p.ceilingAccent} roughness={0.5} />
        </mesh>
      ))}

      {/* the trusses: a tie beam and king post at every bay */}
      <Repeated
        count={d.bays + 1}
        place={(i, m) => m.makeTranslation(0, eaves + 0.08, -i * d.bayDepth)}
      >
        <boxGeometry args={[peakHalf * 2, 0.11, 0.11]} />
        <meshStandardMaterial color={p.ceilingAccent} roughness={0.5} />
      </Repeated>
      <Repeated
        count={d.bays + 1}
        place={(i, m) =>
          m.makeTranslation(0, (eaves + ridge) / 2, -i * d.bayDepth)
        }
      >
        <boxGeometry args={[0.08, ridge - eaves, 0.08]} />
        <meshStandardMaterial color={p.ceilingAccent} roughness={0.5} />
      </Repeated>
    </group>
  );
}

/**
 * The Uffizi's east corridor: flat, low, and covered in painting.
 *
 * There is no vault here at all. The ceiling is a plane of cream plaster
 * divided into square compartments by heavy dark crossbeams, and every
 * compartment carries a grotesque — the symmetrical scrollwork, medallions
 * and small figures that Renaissance decorators took from the excavated
 * rooms of Nero's palace, which were underground and therefore "grottoes".
 *
 * The frescoes are PAINTED, not modelled. A room's worth of grotesque
 * geometry costs more triangles than the whole of the rest of the corridor
 * and reads, from standing height, as a smear; the same ornament drawn into a
 * canvas at load — see ./grotesque — is legible, costs one texture, and tiles
 * the length of the run compartment by compartment. What is modelled is what
 * you can see is solid: the beams, their carved soffit, and the moulded
 * cornice they land on.
 */
function GrotesqueBeams({ style, d }: Props) {
  const p = style.palette;
  const h = d.wallHeight;
  const w = d.halfWidth * 2;
  const mid = -d.length / 2;
  const runLength = d.length + d.bayDepth * 3;
  /** two compartments to a bay, which is roughly the real rhythm */
  const perBay = 2;
  const count = d.bays * perBay + 2;
  const step = runLength / count;

  /*
   * Warm brown, not black-brown. The beams are the largest single area of
   * colour over your head and they set the temperature of the whole corridor:
   * at #4A3524 the room read as a cold cellar with a bright wall in it.
   */
  const beam = '#7A5330';
  const beamLit = '#916540';

  // one tile per compartment down the run, and one across
  const fresco = useMemo(() => {
    const t = grotesqueTexture();
    if (!t) return null;
    const own = t.clone();
    own.needsUpdate = true;
    own.wrapS = THREE.RepeatWrapping;
    own.wrapT = THREE.RepeatWrapping;
    own.repeat.set(1, count);
    return own;
  }, [count]);

  return (
    <group>
      {/* the painted field */}
      <mesh position={[0, h, mid]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, runLength]} />
        <meshStandardMaterial
          color={fresco ? '#FFFFFF' : p.ceiling}
          map={fresco}
          roughness={0.94}
        />
      </mesh>

      {/* the crossbeams. Deep, warm, and the reason the ceiling reads as
          carpentry rather than as a painted lid. */}
      <Repeated
        count={count + 1}
        place={(i, m) => m.makeTranslation(0, h - 0.14, mid + (i - (count + 1) / 2 + 0.5) * step)}
      >
        <boxGeometry args={[w, 0.3, 0.34]} />
        <meshStandardMaterial color={beam} roughness={0.68} />
      </Repeated>
      {/* the carved soffit under each beam: a lighter moulded band, which is
          what catches the light and separates beam from ceiling */}
      <Repeated
        count={count + 1}
        place={(i, m) =>
          m.makeTranslation(0, h - 0.31, mid + (i - (count + 1) / 2 + 0.5) * step)
        }
      >
        <boxGeometry args={[w, 0.08, 0.44]} />
        <meshStandardMaterial color={beamLit} roughness={0.6} />
      </Repeated>

      {/* the two long beams down the sides, where the ceiling meets the wall */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (d.halfWidth - 0.17), h - 0.16, mid]}>
            <boxGeometry args={[0.34, 0.34, runLength]} />
            <meshStandardMaterial color={beam} roughness={0.68} />
          </mesh>
          {/* a gilt fillet along the bottom edge of it */}
          <mesh position={[side * (d.halfWidth - 0.17), h - 0.34, mid]}>
            <boxGeometry args={[0.38, 0.05, runLength]} />
            <meshStandardMaterial color={p.gilt} metalness={0.55} roughness={0.44} />
          </mesh>
        </group>
      ))}

      {/* the dentil course under the beams, running the length of both walls */}
      {[-1, 1].map((side) => (
        <Repeated
          key={side}
          count={Math.round(runLength / 0.38)}
          place={(i, m) =>
            m.makeTranslation(
              side * (d.halfWidth - 0.06),
              h - 0.42,
              mid - runLength / 2 + i * 0.38,
            )
          }
        >
          <boxGeometry args={[0.14, 0.13, 0.19]} />
          <meshStandardMaterial color={p.molding} roughness={0.8} />
        </Repeated>
      ))}
    </group>
  );
}

/**
 * The British Museum's Egyptian gallery: a stone lid, coffered and lit.
 *
 * No glass, no vault, no daylight from above. The ceiling is a gigantic
 * inverted grid — thick square beams crossing at right angles, and between
 * them deep recessed squares whose inner borders step upward in receding
 * layers, like a squared upside-down staircase, before reaching a flat inner
 * panel. It repeats without variation the entire length of the hall.
 *
 * THE SHADOW IS THE SUBJECT. What makes a coffered ceiling read is not the
 * moulding, it is the dark the moulding traps: every recess holds a wedge of
 * shadow, and from the floor the roof is a sharp checkerboard of light and
 * dark. Real-time shadows will not do that here — the caster and the receiver
 * are centimetres apart and the map resolution is spent on the room below —
 * so the occlusion is built into the colours instead: each step deeper into a
 * coffer is a shade darker than the one outside it, and the flat inner panel
 * is darkest of all. It is exactly what the light would do, and it costs
 * nothing.
 *
 * NOTHING IS MOUNTED ON IT. An earlier version recessed little dark cans into
 * the beam soffits, and from the floor a dark disc on a pale ceiling reads as
 * one thing only: a vent. The light in this room comes from the walls and from
 * the windows, which is both what the room does and the reason you look at the
 * hang rather than at the roof.
 */
function DeepCoffers({ style, d }: Props) {
  const p = style.palette;
  const h = d.wallHeight;
  const w = d.halfWidth * 2;
  const mid = -d.length / 2;
  const runLength = d.length + d.bayDepth * 3;
  /** two coffers to a bay along the corridor, three across it */
  const perBay = 2;
  const rows = d.bays * perBay + 2;
  const step = runLength / rows;
  const cols = 3;
  const colW = w / cols;

  /** the beam face, and then three shades of the dark inside a recess */
  const face = p.molding;
  const shade = [
    mix(p.molding, p.ceilingAccent, 0.3),
    mix(p.molding, p.ceilingAccent, 0.62),
    p.ceilingAccent,
  ];
  /*
   * The steps, as fractions of a coffer and heights above the soffit.
   *
   * Each one is a flat TREAD — a closed ring of four slabs — that bridges the
   * whole distance in to the next step up, so the recess is solid all the way
   * round and there is nowhere to see through it into the roof void. That
   * bridging is the difference between a stepped coffer and a stack of bars
   * floating under a hole, and it is only visible at a shallow angle, which
   * is exactly the angle you look down a fifty-metre hall at.
   *
   * Rings rather than nested boxes: a box has to be seen from inside to read
   * as a recess, and the moment one closes over the one below it the whole
   * recess turns back into a flat panel.
   */
  const steps = [0.8, 0.66, 0.53, 0.42];
  const riser = 0.15;
  /*
   * Where the underside of the whole ceiling is.
   *
   * THE RECESS HAS TO FIT INSIDE THE DEPTH OF THE BEAMS. A coffer that rises
   * above the beam grid can be seen into from anywhere in the hall, and from
   * a shallow angle — which is the angle you look at a fifty-metre ceiling
   * from — the treads read as a rack of floating slats. Sunk inside the
   * beams, the far coffers close up exactly as they do in the room: you see
   * into the ones over your head, and the rest are a grid of shadow.
   */
  const bottom = h - 0.4;

  const cell = (i: number) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return [(c - (cols - 1) / 2) * colW, mid + (r - rows / 2 + 0.5) * step] as const;
  };

  return (
    <group>
      {/* the flat inner surface every recess reaches — the darkest thing in
          the room, because it is the furthest into the pocket */}
      <mesh
        position={[0, bottom + riser * (steps.length - 1) + 0.02, mid]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[w, runLength]} />
        <meshStandardMaterial color={mix(p.ceilingAccent, '#000000', 0.14)} roughness={0.97} />
      </mesh>

      {/* the receding treads: four slabs to a ring, three rings to a recess */}
      {steps.slice(0, -1).map((k, level) => {
        const kIn = steps[level + 1];
        const ax = (colW * k) / 2;
        const bx = (colW * kIn) / 2;
        const az = (step * k) / 2;
        const bz = (step * kIn) / 2;
        const y = bottom + riser * level + riser / 2;
        return (
          <group key={level}>
            {/* the two treads across the corridor */}
            <Repeated
              count={rows * cols * 2}
              place={(i, m) => {
                const [x, z] = cell(Math.floor(i / 2));
                m.makeTranslation(x, y, z + (i % 2 ? 1 : -1) * ((az + bz) / 2));
              }}
            >
              <boxGeometry args={[ax * 2, riser, az - bz]} />
              <meshStandardMaterial color={shade[level]} roughness={0.96} />
            </Repeated>
            {/* and the two along it, meeting them at the corners */}
            <Repeated
              count={rows * cols * 2}
              place={(i, m) => {
                const [x, z] = cell(Math.floor(i / 2));
                m.makeTranslation(x + (i % 2 ? 1 : -1) * ((ax + bx) / 2), y, z);
              }}
            >
              <boxGeometry args={[ax - bx, riser, bz * 2]} />
              <meshStandardMaterial color={shade[level]} roughness={0.96} />
            </Repeated>
          </group>
        );
      })}

      {/* the transverse beams: thick, square, unadorned */}
      <Repeated
        count={rows + 1}
        place={(i, m) => m.makeTranslation(0, h - 0.14, mid + (i - (rows + 1) / 2 + 0.5) * step)}
      >
        <boxGeometry args={[w, 0.52, step * (1 - steps[0]) + 0.04]} />
        <meshStandardMaterial color={face} roughness={0.9} />
      </Repeated>
      {/* and the ribs the other way, so the grid closes */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * colW) / 2, h - 0.14, mid]}>
          <boxGeometry args={[colW * (1 - steps[0]) + 0.04, 0.52, runLength]} />
          <meshStandardMaterial color={face} roughness={0.9} />
        </mesh>
      ))}
      {/* a thin fascia under every beam, which is the line the whole grid
          reads by from the far end of the hall */}
      <Repeated
        count={rows + 1}
        place={(i, m) => m.makeTranslation(0, h - 0.42, mid + (i - (rows + 1) / 2 + 0.5) * step)}
      >
        <boxGeometry args={[w, 0.09, step * (1 - steps[0]) + 0.14]} />
        <meshStandardMaterial color={mix(p.molding, p.ceilingAccent, 0.25)} roughness={0.92} />
      </Repeated>

      {/* the cornice both walls, where the grid lands on the entablature */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (d.halfWidth - 0.16), h - 0.44, mid]}>
          <boxGeometry args={[0.42, 0.5, runLength]} />
          <meshStandardMaterial color={face} roughness={0.88} />
        </mesh>
      ))}

    </group>
  );
}

const CEILINGS = {
  'barrel-skylight': BarrelSkylight,
  'pitched-glass': PitchedGlass,
  'fresco-vault': FrescoVault,
  'steel-glass-arch': SteelGlassArch,
  'peaked-court': PeakedCourt,
  'grotesque-beams': GrotesqueBeams,
  'deep-coffers': DeepCoffers,
} as const;

export function Ceiling(props: Props) {
  const Impl = CEILINGS[props.style.ceiling] ?? BarrelSkylight;
  return <Impl {...props} />;
}
