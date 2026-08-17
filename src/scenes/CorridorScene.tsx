/**
 * CorridorScene — spec §10.2 / §10A.
 *
 * One procedural machine, five museums. The architecture (ceiling, floor, wall
 * treatment, fixtures, frames), the palette and the entire lighting rig come
 * from the chosen museum's style record; nothing about a particular building
 * is hard-coded here. Adding a sixth museum is a data change.
 *
 * HANGING
 * -------
 * Every painting is centred on a shared hanging line, and the moulded panel
 * behind it is centred on the same line — so a canvas sits in the middle of
 * its surround rather than sinking to the bottom of it, whatever its
 * proportions. Three hang patterns are supported: a dense salon stack, a
 * single large work per bay, and works alternating between the two walls.
 *
 * CONTROLS
 *   move mouse      look around (wide yaw, so both walls are viewable)
 *   ↑ / ↓           walk forward / backward
 *   Enter or Shift  accelerate to the end of the corridor
 *   wheel / drag    also move along the rail
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../state/store';
import { corridor, warp, pointer, resetCorridor } from '../state/motion';
import { damp, dampK } from '../lib/damp';
import { flash } from '../ui/Flash';
import { OrnateFrame } from './OrnateFrame';
import { frameReach } from './frames';
import { fitWork } from './fit';
import { Ceiling } from './corridor/Ceiling';
import { Floor, Walls } from './corridor/Surfaces';
import { Fixtures } from './corridor/Fixtures';
import { bayZ, dimsFor, hangHeight, type Dims } from './corridor/dims';
import type { ArtworkIndexEntry, DeviceTier, MuseumData } from '../types';

function useArtworkTextures(artworks: ArtworkIndexEntry[]) {
  return useMemo(() => {
    const loader = new THREE.TextureLoader();
    const list = artworks.map((a) => {
      const t = loader.load(`/artworks/${a.id}/wall.jpg`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
    return list;
  }, [artworks]);
}

/**
 * One hung painting: the accent panel it hangs against, its moulded frame, and
 * the canvas itself — all sharing a centre.
 */
function HungWork({
  artwork,
  texture,
  museum,
  width,
  height,
  showPanel = true,
}: {
  artwork: ArtworkIndexEntry;
  texture: THREE.Texture;
  museum: MuseumData;
  width: number;
  height: number;
  showPanel?: boolean;
}) {
  const reach = frameReach(museum.style.frame) * height;
  // The painter's ground, pulled most of the way toward the wall tone. At full
  // strength it reads as a coloured rectangle stuck on the wall, which no
  // gallery has; at this strength it is a tonal shift you notice only once you
  // are standing in front of it. The full accent belongs in the artwork room.
  const ground = useMemo(() => {
    const c = new THREE.Color(artwork.accent).lerp(new THREE.Color(museum.style.palette.wall), 0.66);
    return `#${c.getHexString()}`;
  }, [artwork.accent, museum.style.palette.wall]);

  return (
    <group>
      {showPanel && (
        <mesh position={[0, 0, -0.02]} receiveShadow>
          <planeGeometry args={[width + reach * 2 + 0.42, height + reach * 2 + 0.42]} />
          <meshStandardMaterial color={ground} roughness={0.9} />
        </mesh>
      )}
      <OrnateFrame
        kind={museum.style.frame}
        width={width}
        height={height}
        gilt={museum.style.palette.gilt}
        dark={museum.style.palette.wallDeep}
      />
      <mesh position={[0, 0, 0.028]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.88}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={0.14}
        />
      </mesh>
    </group>
  );
}

/**
 * The works on the walls, distributed by the museum's hang pattern.
 *
 * salon       a large work centred on the hanging line with two smaller ones
 *             stacked above it — the Louvre's densely packed wall
 * single      one large work per bay, both walls
 * alternating one work per bay, sides alternating
 */
function Bays({ museum, d }: { museum: MuseumData; d: Dims }) {
  const artworks = museum.artworks;
  const textures = useArtworkTextures(artworks);
  const centre = hangHeight(d);
  const hang = museum.style.hang;
  if (!artworks.length) return null;

  const nodes: React.ReactNode[] = [];

  for (let bay = 0; bay < d.bays; bay++) {
    const z = bayZ(d, bay);
    const sides: Array<1 | -1> = hang === 'alternating' ? [bay % 2 === 0 ? 1 : -1] : [1, -1];

    for (const side of sides) {
      const slot = hang === 'alternating' ? bay : bay * 2 + (side > 0 ? 0 : 1);
      const i = slot % artworks.length;
      const x = side * (d.halfWidth - 0.09);
      const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const maxH = hang === 'salon' ? d.wallHeight * 0.3 : Math.min(2.1, d.wallHeight * 0.36);
      const main = fitWork(artworks[i].aspect, maxH, d.bayDepth * 0.78);

      nodes.push(
        <group key={`${bay}-${side}`} position={[x, 0, z]} rotation={[0, ry, 0]}>
          <group position={[0, centre, 0.05]}>
            <HungWork
              artwork={artworks[i]}
              texture={textures[i]}
              museum={museum}
              width={main.width}
              height={main.height}
            />
          </group>

          {hang === 'salon' &&
            // two smaller canvases stacked above the principal work, the way a
            // salon wall is filled to the cornice
            [-1, 1].map((sx) => {
              const j = (i + (sx > 0 ? 1 : 2)) % artworks.length;
              const small = fitWork(artworks[j].aspect, maxH * 0.46, d.bayDepth * 0.32);
              return (
                <group
                  key={sx}
                  position={[
                    sx * (d.bayDepth * 0.22),
                    centre + main.height / 2 + small.height / 2 + 0.42,
                    0.05,
                  ]}
                >
                  <HungWork
                    artwork={artworks[j]}
                    texture={textures[j]}
                    museum={museum}
                    width={small.width}
                    height={small.height}
                    showPanel={false}
                  />
                </group>
              );
            })}
        </group>,
      );
    }
  }

  return <>{nodes}</>;
}

/**
 * The terminal wall. Walking into it is the transition to the floor plan, so
 * it has to read as a destination from the far end of the corridor: it is
 * lit brighter than anything else and carries either the museum's own
 * terminal feature (Orsay's clock) or a single large canvas.
 */
function Apse({ museum, d }: { museum: MuseumData; d: Dims }) {
  const p = museum.style.palette;
  const artworks = museum.artworks;
  const textures = useArtworkTextures(artworks);
  const a = artworks[1] ?? artworks[0];
  if (!a) return null;
  const { width: aw, height: h } = fitWork(a.aspect, Math.min(2.6, d.wallHeight * 0.42), d.halfWidth * 1.2);

  return (
    <group>
      {/* sized to the room it closes — anything taller reads as a slab
          floating above the roofline rather than as the end of the corridor */}
      <mesh position={[0, (d.vaultHeight + 1) / 2, d.apseZ]} receiveShadow>
        <planeGeometry args={[d.halfWidth * 2.1, d.vaultHeight + 1]} />
        {museum.style.fixtures.glazedEnd ? (
          // a window, not a wall: the light at the end of the corridor is
          // outside, which is what makes a covered court read as a courtyard
          <meshBasicMaterial color={p.sky} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={p.wallDeep} roughness={0.86} />
        )}
      </mesh>
      {museum.style.fixtures.glazedEnd && <EndGlazing d={d} colour={p.molding} />}
      {!museum.style.fixtures.clock && (
        <group position={[0, hangHeight(d) + 0.5, d.apseZ + 0.1]}>
          <mesh position={[0, 0, -0.02]}>
            <planeGeometry args={[aw + 1.6, h + 1.6]} />
            <meshStandardMaterial
              color={museum.style.fixtures.glazedEnd ? p.wall : a.accent}
              roughness={0.88}
            />
          </mesh>
          <OrnateFrame
            kind={museum.style.frame}
            width={aw}
            height={h}
            gilt={p.gilt}
            dark={p.wallDeep}
          />
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[aw, h]} />
            <meshStandardMaterial
              map={textures[1] ?? textures[0]}
              roughness={0.86}
              emissiveMap={textures[1] ?? textures[0]}
              emissive="#ffffff"
              emissiveIntensity={0.22}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** The mullion grid over a glazed corridor end. */
function EndGlazing({ d, colour }: { d: Dims; colour: string }) {
  const w = d.halfWidth * 2.1;
  const h = d.vaultHeight + 1;
  const cols = Math.round(w / 1.15);
  const rows = Math.round(h / 1.35);
  const bars: React.ReactNode[] = [];
  for (let i = 1; i < cols; i++) {
    bars.push(
      <mesh key={`c${i}`} position={[-w / 2 + (i / cols) * w, h / 2, d.apseZ + 0.06]}>
        <boxGeometry args={[0.09, h, 0.09]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </mesh>,
    );
  }
  for (let j = 1; j < rows; j++) {
    bars.push(
      <mesh key={`r${j}`} position={[0, (j / rows) * h, d.apseZ + 0.06]}>
        <boxGeometry args={[w, 0.09, 0.09]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </mesh>,
    );
  }
  return <>{bars}</>;
}

/** Warm lamps washing the walls, plus the bright pool at the far end. */
function Lamps({ museum, d }: { museum: MuseumData; d: Dims }) {
  const l = museum.style.light;
  const lights: React.ReactNode[] = [];
  // chandeliers carry their own lights; adding lamps too would double up
  if (!museum.style.fixtures.chandeliers) {
    for (let b = 0; b < d.bays; b += 2) {
      lights.push(
        <pointLight
          key={b}
          position={[0, d.wallHeight - 0.6, bayZ(d, b)]}
          color={l.lamp}
          intensity={l.lampIntensity}
          distance={d.bayDepth * 3.2}
          decay={1.9}
        />,
      );
    }
  }
  return (
    <>
      {lights}
      <pointLight
        position={[0, d.wallHeight * 0.62, d.apseZ + 2.4]}
        color={l.lamp}
        intensity={l.lampIntensity * 2.6 + 8}
        distance={d.bayDepth * 3}
        decay={1.7}
      />
    </>
  );
}

export function CorridorScene({ tier }: { tier: DeviceTier }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const phase = useStore((s) => s.phase);
  const museum = useStore((s) => s.museum);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setPhase = useStore((s) => s.setPhase);
  const look = useRef({ x: 0, y: 0 });
  const keys = useRef<Set<string>>(new Set());
  const sprint = useRef<gsap.core.Tween | null>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);

  const d = useMemo(() => (museum ? dimsFor(museum.style) : null), [museum]);

  // returning from the map drops you back short of the end, so the transition
  // does not immediately re-fire
  useEffect(() => {
    if (phase === 'corridor' && corridor.t >= 0.93) resetCorridor(0.8);
  }, [phase]);

  // --- input: wheel, drag, arrows, sprint ---
  useEffect(() => {
    if (phase !== 'corridor') return;

    const clamp = () => {
      corridor.goal = Math.max(0, Math.min(1, corridor.goal));
    };
    const onWheel = (e: WheelEvent) => {
      sprint.current?.kill();
      corridor.goal += e.deltaY * 0.00045;
      clamp();
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => {
      const dy = touchY - e.touches[0].clientY;
      touchY = e.touches[0].clientY;
      corridor.goal += dy * 0.0018;
      clamp();
    };

    const accelerate = () => {
      sprint.current?.kill();
      sprint.current = gsap.to(corridor, {
        goal: 1,
        duration: reducedMotion ? 0.3 : 2.4 * (1 - corridor.t) + 0.5,
        ease: 'power2.in',
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        keys.current.add(e.key);
        sprint.current?.kill();
      }
      if (e.key === 'Enter' || e.key === 'Shift') {
        e.preventDefault();
        accelerate();
      }
      if (e.key === 'PageDown') {
        corridor.goal += 0.1;
        clamp();
      }
      if (e.key === 'PageUp') {
        corridor.goal -= 0.1;
        clamp();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key);
    const onBlur = () => keys.current.clear();

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.current.clear();
      sprint.current?.kill();
    };
  }, [phase, reducedMotion]);

  // T1 portal tail: the camera dollies in from the corridor mouth
  useEffect(() => {
    if (phase === 'corridor' && corridor.mouth > 0.01) {
      gsap.to(corridor, { mouth: 0, duration: reducedMotion ? 0.2 : 1.2, ease: 'power2.inOut' });
    }
    if (phase === 'landing') {
      corridor.mouth = 4;
      resetCorridor(0);
    }
  }, [phase, reducedMotion]);

  // T3 warp: map → gallery, straight through the end wall (spec §11)
  useEffect(() => {
    if (phase !== 'warp') return;
    warp.p = 0;
    const tl = gsap.timeline({ onComplete: () => setPhase('gallery') });
    if (reducedMotion) {
      flash(400);
      tl.to(warp, { p: 1, duration: 0.25, ease: 'none' });
    } else {
      tl.to(warp, { p: 1, duration: 1.4, ease: 'power4.in' });
      tl.call(() => flash(900), [], 1.15);
    }
    const failsafe = window.setTimeout(() => setPhase('gallery'), reducedMotion ? 700 : 2200);
    return () => {
      tl.kill();
      window.clearTimeout(failsafe);
    };
  }, [phase, reducedMotion, setPhase]);

  useFrame((_, delta) => {
    if (!d) return;
    if (phase === 'corridor' && keys.current.size) {
      const speed = 0.16 * Math.min(delta, 0.05) * 60 * 0.35;
      if (keys.current.has('ArrowUp')) corridor.goal += speed;
      if (keys.current.has('ArrowDown')) corridor.goal -= speed;
      corridor.goal = Math.max(0, Math.min(1, corridor.goal));
    }
    corridor.t = damp(corridor.t, corridor.goal, 0.08, delta);

    if (phase === 'corridor' && corridor.t >= 0.95) setPhase('map');

    const railZ = corridor.mouth + -d.length * corridor.t;
    let z = railZ;
    let fov = 48;
    if (phase === 'warp') {
      z = THREE.MathUtils.lerp(railZ, d.apseZ + 1.6, warp.p);
      fov = 48 + 30 * warp.p * warp.p;
    }

    const k = dampK(0.075, delta);
    const active = phase === 'corridor' && !reducedMotion;
    const px = active ? pointer.x : 0;
    const py = active ? pointer.y : 0;
    look.current.x += (px - look.current.x) * k;
    look.current.y += (py - look.current.y) * k;

    camera.position.set(look.current.x * 0.35, 1.62 - look.current.y * 0.06, z);
    camera.rotation.set(
      (-look.current.y * 14 * Math.PI) / 180,
      (-look.current.x * 38 * Math.PI) / 180,
      0,
      'YXZ',
    );
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // the key light's shadow frustum follows the camera so its bars stay sharp
    if (sunRef.current && museum) {
      const from = museum.style.light.keyFrom;
      const t = sunRef.current.target;
      t.position.set(0, 1.2, z - 6);
      t.updateMatrixWorld();
      sunRef.current.position.set(from[0], from[1], z - 6 + from[2]);
      sunRef.current.updateMatrixWorld();
    }
  });

  if (!museum || !d) return null;
  const l = museum.style.light;
  const reflectorRes = tier.name === 'high' ? 1024 : 512;

  return (
    <group>
      <Floor style={museum.style} d={d} reflectorRes={reflectorRes} />
      <Walls style={museum.style} d={d} reflectorRes={reflectorRes} />
      <Ceiling style={museum.style} d={d} />
      <Bays museum={museum} d={d} />
      <Fixtures style={museum.style} d={d} />
      <Apse museum={museum} d={d} />
      <Lamps museum={museum} d={d} />

      {/* the key light — skylight, window or dusk, per museum, and the only
          shadow caster in the room */}
      <directionalLight
        ref={sunRef}
        color={l.key}
        intensity={l.keyIntensity}
        castShadow
        shadow-mapSize-width={tier.name === 'low' ? 1024 : 2048}
        shadow-mapSize-height={tier.name === 'low' ? 1024 : 2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={0.5}
        shadow-camera-far={48}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
      {/* sky bounce filling the shadows, so nothing goes black */}
      <hemisphereLight args={[l.sky, l.ground, l.ambient]} />
    </group>
  );
}
