/**
 * The roof over each corridor.
 *
 * This is the single most identifying feature of a museum interior — before
 * you read a label you know which building you are standing in from what is
 * above you — so each museum gets its own construction rather than a tinted
 * copy of one vault.
 */
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
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

/* ── Vatican: frescoed vault in heavy gilded stucco ─────────────────────── */

function FrescoVault({ style, d }: Props) {
  const p = style.palette;
  const r = d.halfWidth;
  const springing = d.wallHeight;
  const mid = -d.length / 2;

  return (
    <group>
      {/* base vault — the fresco ground */}
      <mesh position={[0, springing, mid]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[r, r, d.length + d.bayDepth * 3, 40, 1, true, Math.PI / 2, Math.PI]}
        />
        <meshStandardMaterial color={p.ceiling} roughness={0.92} side={THREE.BackSide} />
      </mesh>

      {/* painted fields: an alternating sequence of coloured panels set into
          the vault, standing in for the fresco cycle */}
      {Array.from({ length: d.bays }, (_, b) => {
        const z = bayZ(d, b);
        const warm = b % 2 === 0;
        return (
          <group key={b}>
            <mesh position={[0, springing + r * 0.86, z]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[r * 0.66, d.bayDepth * 0.6]} />
              <meshStandardMaterial
                color={warm ? p.ceilingAccent : p.wallDeep}
                roughness={0.9}
              />
            </mesh>
            {/* side panels, angled into the curve of the vault */}
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                position={[s * r * 0.56, springing + r * 0.6, z]}
                rotation={[Math.PI / 2, 0, 0, 'ZXY']}
                scale={[1, 1, 1]}
              >
                <planeGeometry args={[r * 0.36, d.bayDepth * 0.55]} />
                <meshStandardMaterial
                  color={warm ? p.wallDeep : p.ceilingAccent}
                  roughness={0.9}
                />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* deeply carved gilded stucco: transverse ribs plus longitudinal bands,
          which is what gives the Gallery of Maps its coffered density */}
      <Repeated
        count={d.bays + 1}
        place={(i, m) => m.makeTranslation(0, springing, -i * d.bayDepth)}
      >
        <torusGeometry args={[r - 0.03, 0.14, 8, 24, Math.PI]} />
        <meshStandardMaterial color={p.molding} metalness={0.72} roughness={0.36} />
      </Repeated>
      {[-0.62, 0, 0.62].map((f) => {
        const a = (f * Math.PI) / 2;
        return (
          <mesh
            key={f}
            position={[Math.sin(a) * (r - 0.06), springing + Math.cos(a) * (r - 0.06), mid]}
          >
            <boxGeometry args={[0.16, 0.16, d.length + d.bayDepth * 3]} />
            <meshStandardMaterial color={p.molding} metalness={0.7} roughness={0.38} />
          </mesh>
        );
      })}
      {/* gilt cornice at the springing */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (r - 0.08), springing - 0.12, mid]}>
          <boxGeometry args={[0.26, 0.34, d.length + d.bayDepth * 3]} />
          <meshStandardMaterial color={p.molding} metalness={0.62} roughness={0.42} />
        </mesh>
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

const CEILINGS = {
  'barrel-skylight': BarrelSkylight,
  'pitched-glass': PitchedGlass,
  'fresco-vault': FrescoVault,
  'steel-glass-arch': SteelGlassArch,
  'peaked-court': PeakedCourt,
} as const;

export function Ceiling(props: Props) {
  const Impl = CEILINGS[props.style.ceiling] ?? BarrelSkylight;
  return <Impl {...props} />;
}
