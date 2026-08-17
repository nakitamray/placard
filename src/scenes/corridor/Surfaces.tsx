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
import { bayZ, type Dims } from './dims';

interface Props {
  style: MuseumStyle;
  d: Dims;
  /** reflection resolution drops on weaker devices */
  reflectorRes: number;
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
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow={castShadow}>
      {children}
    </instancedMesh>
  );
}

/* ── floors ─────────────────────────────────────────────────────────────── */

export function Floor({ style, d, reflectorRes }: Props) {
  const p = style.palette;
  const kind = style.floor;
  const mid = -d.length / 2;
  const run = d.length + d.bayDepth * 3;
  const w = d.halfWidth * 2;

  // how wet the floor looks. Polished marble and stone throw long specular
  // streaks down a gallery; a courtyard pavement does not.
  const mirror =
    kind === 'marble-inlay' ? 0.62 : kind === 'court-paving' ? 0.22 : kind === 'parquet' ? 0.4 : 0.5;
  const roughness = kind === 'court-paving' ? 0.5 : kind === 'parquet' ? 0.3 : 0.18;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, mid]} receiveShadow>
        <planeGeometry args={[w, run]} />
        <MeshReflectorMaterial
          resolution={reflectorRes}
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
      </mesh>

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

export function Walls({ style, d }: Props) {
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

  /** skirting and dado, common to the picture galleries */
  const bands = (side: 1 | -1, dado: string, dadoY: number) => (
    <group key={`b${side}`}>
      <mesh position={[side * (d.halfWidth - 0.02), 0.09, mid]} receiveShadow>
        <boxGeometry args={[0.08, 0.18, run]} />
        <meshStandardMaterial color={dado} roughness={0.7} />
      </mesh>
      <mesh position={[side * (d.halfWidth - 0.03), dadoY, mid]} receiveShadow>
        <boxGeometry args={[0.1, 0.1, run]} />
        <meshStandardMaterial color={dado} roughness={0.7} />
      </mesh>
    </group>
  );

  if (kind === 'court-facade') {
    // The Met court's whole character is that the two walls disagree: smooth
    // pale stone with lit panels on one side, red brick and white arches on
    // the other, as though the roof were dropped between two buildings.
    return (
      <group>
        {base(-1, p.wall)}
        {base(1, p.wallDeep)}

        {/* left: illuminated rectangular panels and arched doorways */}
        {Array.from({ length: d.bays }, (_, b) => (
          <group key={`L${b}`} position={[-d.halfWidth + 0.05, 0, bayZ(d, b)]}>
            <mesh rotation={[0, Math.PI / 2, 0]} position={[0, d.wallHeight * 0.62, 0]}>
              <planeGeometry args={[d.bayDepth * 0.5, d.wallHeight * 0.3]} />
              <meshBasicMaterial color={p.molding} toneMapped={false} />
            </mesh>
            {b % 2 === 1 && (
              <group>
                <mesh rotation={[0, Math.PI / 2, 0]} position={[0, 1.2, 0]}>
                  <planeGeometry args={[1.5, 2.4]} />
                  <meshStandardMaterial color="#1A1A1E" roughness={0.9} />
                </mesh>
                <mesh rotation={[0, Math.PI / 2, 0]} position={[0, 2.4, 0]}>
                  <circleGeometry args={[0.75, 20, 0, Math.PI]} />
                  <meshStandardMaterial color="#1A1A1E" roughness={0.9} />
                </mesh>
              </group>
            )}
          </group>
        ))}

        {/* right: brick courses, white stone arches, circular medallions */}
        <Instanced
          count={d.bays * 3}
          place={(i, m) => {
            const b = Math.floor(i / 3);
            const row = i % 3;
            m.makeRotationY(-Math.PI / 2);
            m.setPosition(d.halfWidth - 0.05, 1.5 + row * 1.7, bayZ(d, b));
          }}
        >
          <planeGeometry args={[d.bayDepth * 0.9, 0.09]} />
          <meshStandardMaterial color={p.molding} roughness={0.8} />
        </Instanced>
        {Array.from({ length: d.bays }, (_, b) => (
          <group key={`R${b}`} position={[d.halfWidth - 0.06, 0, bayZ(d, b)]}>
            <mesh rotation={[0, -Math.PI / 2, 0]} position={[0, 3.4, 0]}>
              <ringGeometry args={[0.42, 0.58, 24]} />
              <meshStandardMaterial color={p.molding} roughness={0.75} />
            </mesh>
            <mesh rotation={[0, -Math.PI / 2, 0]} position={[0, 1.9, 0]}>
              <ringGeometry args={[1.0, 1.16, 24, 1, 0, Math.PI]} />
              <meshStandardMaterial color={p.molding} roughness={0.75} />
            </mesh>
          </group>
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
