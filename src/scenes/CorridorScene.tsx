/**
 * CorridorScene — spec §10.2 / §10A, with the art direction moved from the
 * spec's flat museum daylight to raking late-afternoon sun.
 *
 * Procedural architecture: 12 bays × 4m, width 7m, walls to cornice at
 * 5.20m, barrel vault to 8.50m, terminal apse. One repeated module,
 * instanced elements, camera on rails with free look.
 *
 * LIGHT — a deliberate departure from §10A.6
 * ------------------------------------------
 * The spec's brightness guardrail asks for a uniformly light, warm, open
 * corridor. This build instead lights the space from a low sun through the
 * clerestory on the west wall: bright pools and hard mullion bars on the
 * floor, deep shadow between bays, warm lamps picking out each canvas. The
 * guardrail's real intent — never a murky black interior that hides
 * modelling — still holds: the vault stays the brightest large surface and
 * the sunlit floor is near-white. Contrast does the work that flat fill did.
 *
 * CONTROLS
 *   move mouse      look around (wide yaw, so both walls are viewable)
 *   ↑ / ↓           walk forward / backward
 *   Enter or Shift  accelerate to the end of the corridor
 *   wheel / drag    also move along the rail
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../state/store';
import { corridor, warp, pointer, resetCorridor } from '../state/motion';
import { damp, dampK } from '../lib/damp';
import { LAMP } from './Lighting';
import { flash } from '../ui/Flash';

const BAYS = 12;
const BAY = 4;
const LENGTH = BAYS * BAY; // 48m
const HALF_W = 3.5;
const WALL_H = 5.2;
const APSE_Z = -(LENGTH + 3.5);

/** Moodier palette: warm stone that reads mid-tone in shade, near-white in sun. */
const PAL = {
  field: '#BFB3A0',
  recess: '#B2A692',
  highlight: '#D6CBB6',
  vault: '#CDC3B1',
  apse: '#8A7A63',
  floorLight: '#B9AF9E',
  floorInlay: '#8E836E',
  plinth: '#1F1C19',
  gilt: '#C9A227',
  marble: '#E9E3D6',
  sun: '#FFE2B0',
};

/** Sun direction, low and raking from the clerestory side (−x). */
const SUN_FROM = new THREE.Vector3(-9, 11, 6);

function useArtworkTextures() {
  const artworks = useStore((s) => s.artworks);
  return useMemo(() => {
    const loader = new THREE.TextureLoader();
    return artworks.map((a) => {
      const t = loader.load(`/artworks/${a.id}/wall.jpg`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
  }, [artworks]);
}

/**
 * Each bay carries one artwork on a panel tinted with that artist's accent,
 * so the works are distinguishable at a glance down the corridor.
 */
function Bays() {
  const artworks = useStore((s) => s.artworks);
  const textures = useArtworkTextures();
  if (!artworks.length) return null;

  const nodes: React.ReactNode[] = [];
  for (let bay = 0; bay < BAYS; bay++) {
    const i = bay % artworks.length;
    const a = artworks[i];
    const z = -(bay * BAY + BAY / 2);
    const side = bay % 2 === 0 ? 1 : -1; // alternate walls
    const x = side * (HALF_W - 0.06);
    const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;

    const h = 1.9;
    const w = h * a.aspect;

    nodes.push(
      <group key={bay} position={[x, 0, z]} rotation={[0, ry, 0]}>
        {/* bolection surround, standing proud of the wall */}
        <mesh position={[0, 2.8, 0.03]} castShadow>
          <boxGeometry args={[3.22, 3.92, 0.06]} />
          <meshStandardMaterial color={PAL.highlight} roughness={0.7} />
        </mesh>
        {/* accent field — the artist's own ground, in front of the surround */}
        <mesh position={[0, 2.8, 0.062]} receiveShadow>
          <planeGeometry args={[3.0, 3.7]} />
          <meshStandardMaterial color={a.accent} roughness={0.88} />
        </mesh>
        {/* painting, hung on the shared 1.7m centre line */}
        <group position={[0, 1.75, 0.085]}>
          <mesh position={[0, 0, -0.02]} castShadow>
            <boxGeometry args={[w + 0.2, h + 0.2, 0.08]} />
            <meshStandardMaterial color={PAL.gilt} roughness={0.3} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.026]}>
            <planeGeometry args={[w, h]} />
            <meshStandardMaterial
              map={textures[i]}
              roughness={0.86}
              emissiveMap={textures[i]}
              emissive="#ffffff"
              emissiveIntensity={0.12}
            />
          </mesh>
        </group>
        {/* wall label — the caption strip beside each canvas */}
        <mesh position={[w / 2 + 0.42, 1.3, 0.075]}>
          <planeGeometry args={[0.34, 0.18]} />
          <meshStandardMaterial color="#F2EBDF" roughness={0.9} />
        </mesh>
      </group>,
    );
  }

  // terminal apse painting — the magnet and the T2 trigger (spec §10A.7)
  const a = artworks[1] ?? artworks[0];
  const h = 2.1;
  nodes.push(
    <group key="apse" position={[0, 2.0, APSE_Z + 0.08]}>
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[h * a.aspect + 1.0, h + 1.0]} />
        <meshStandardMaterial color={a.accent} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, -0.01]} castShadow>
        <boxGeometry args={[h * a.aspect + 0.26, h + 0.26, 0.09]} />
        <meshStandardMaterial color={PAL.gilt} roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.038]}>
        <planeGeometry args={[h * a.aspect, h]} />
        <meshStandardMaterial
          map={textures[1] ?? textures[0]}
          roughness={0.86}
          emissiveMap={textures[1] ?? textures[0]}
          emissive="#ffffff"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>,
  );
  return <>{nodes}</>;
}

function Pilasters() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current!;
    const mat = new THREE.Matrix4();
    let i = 0;
    for (let b = 0; b <= BAYS; b++) {
      for (const side of [-1, 1]) {
        mat.setPosition(side * (HALF_W - 0.07), WALL_H / 2, -b * BAY);
        m.setMatrixAt(i++, mat);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, (BAYS + 1) * 2]} castShadow receiveShadow>
      <boxGeometry args={[0.14, WALL_H, 0.5]} />
      <meshStandardMaterial color={PAL.highlight} roughness={0.75} />
    </instancedMesh>
  );
}

function VaultRibs() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current!;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    for (let b = 0; b <= BAYS; b++) {
      pos.set(0, WALL_H - 0.2, -b * BAY);
      mat.compose(pos, q, scl);
      m.setMatrixAt(b, mat);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BAYS + 1]}>
      <torusGeometry args={[3.42, 0.09, 8, 28, Math.PI]} />
      <meshStandardMaterial color={PAL.highlight} roughness={0.72} />
    </instancedMesh>
  );
}

/**
 * Clerestory windows on the −x side. The wall itself does not cast, so the
 * sun passes through it; the mullions do, which is what throws the hard
 * bars of light across the floor and the opposite wall.
 */
function Clerestory() {
  const nodes: React.ReactNode[] = [];
  for (let b = 0; b < BAYS; b++) {
    const z = -(b * BAY + BAY / 2);
    // sky seen through the opening
    nodes.push(
      <mesh key={`w${b}`} position={[-HALF_W + 0.02, 4.35, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.4, 1.5]} />
        <meshBasicMaterial color="#FFF1D6" toneMapped={false} />
      </mesh>,
    );
    // mullions — the shadow casters
    for (const dz of [-0.8, 0, 0.8]) {
      nodes.push(
        <mesh key={`m${b}-${dz}`} position={[-HALF_W + 0.06, 4.35, z + dz]} castShadow>
          <boxGeometry args={[0.1, 1.5, 0.09]} />
          <meshStandardMaterial color={PAL.highlight} roughness={0.8} />
        </mesh>,
      );
    }
    nodes.push(
      <mesh key={`t${b}`} position={[-HALF_W + 0.06, 4.35, z]} castShadow>
        <boxGeometry args={[0.1, 0.09, 2.4]} />
        <meshStandardMaterial color={PAL.highlight} roughness={0.8} />
      </mesh>,
    );
  }
  return <>{nodes}</>;
}

/**
 * A faint warm haze on the floor where the sun lands. The bars themselves are
 * real shadows cast by the mullions — this only warms the light between them,
 * so it stays subtle enough never to read as a decal.
 */
function SunPools() {
  const nodes: React.ReactNode[] = [];
  for (let b = 0; b < BAYS; b++) {
    const z = -(b * BAY + BAY / 2);
    nodes.push(
      <mesh key={`f${b}`} rotation={[-Math.PI / 2, 0, 0]} position={[1.15, 0.012, z + 1.1]}>
        <planeGeometry args={[3.2, 2.1]} />
        <meshBasicMaterial
          color={PAL.sun}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>,
    );
  }
  return <>{nodes}</>;
}

function PlinthsAndSculpture() {
  const nodes: React.ReactNode[] = [];
  for (let b = 1; b < BAYS; b += 2) {
    const z = -(b * BAY + BAY / 2);
    const s = 1 + ((b * 37) % 17) / 100 - 0.08;
    nodes.push(
      <group key={b} position={[-(HALF_W - 0.9), 0, z]} scale={[s, s, s]}>
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.55, 1.1, 0.55]} />
          <meshStandardMaterial color={PAL.plinth} roughness={0.55} />
        </mesh>
        <group position={[0, 1.1, 0]} rotation={[0, (b * 0.9) % Math.PI, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <capsuleGeometry args={[0.16, 0.5, 6, 12]} />
            <meshStandardMaterial color={PAL.marble} roughness={0.42} />
          </mesh>
          <mesh position={[0.02, 0.86, 0]} castShadow>
            <sphereGeometry args={[0.12, 16, 12]} />
            <meshStandardMaterial color={PAL.marble} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0.08, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.26, 0.16, 16]} />
            <meshStandardMaterial color={PAL.marble} roughness={0.5} />
          </mesh>
        </group>
      </group>,
    );
  }
  return <>{nodes}</>;
}

function Lamps() {
  const lights: React.ReactNode[] = [];
  for (let b = 0; b < BAYS; b += 2) {
    const z = -(b * BAY + BAY / 2);
    lights.push(
      <pointLight
        key={b}
        position={[0, WALL_H - 0.35, z]}
        color={LAMP}
        intensity={9}
        distance={11}
        decay={1.9}
      />,
    );
  }
  return (
    <>
      {lights}
      {/* the apse burns brightest — the destination (spec §10A.7) */}
      <pointLight
        position={[0, 3.4, APSE_Z + 1.8]}
        color={LAMP}
        intensity={22}
        distance={12}
        decay={1.7}
      />
      <pointLight
        position={[0, 0.8, APSE_Z + 2.6]}
        color={LAMP}
        intensity={6}
        distance={7}
        decay={2}
      />
    </>
  );
}

export function CorridorScene() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const phase = useStore((s) => s.phase);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setPhase = useStore((s) => s.setPhase);
  const look = useRef({ x: 0, y: 0 });
  const keys = useRef<Set<string>>(new Set());
  const sprint = useRef<gsap.core.Tween | null>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);

  // returning from the map drops you back short of the apse, so the T2
  // trigger does not immediately re-fire
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
      // ease all the way to the apse; T2 fires when the camera arrives
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

  // T3 warp: map → gallery, straight through the apse (spec §11)
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
    // held arrows walk the rail; everything else eases toward its target
    if (phase === 'corridor' && keys.current.size) {
      const speed = 0.16 * Math.min(delta, 0.05) * 60 * 0.35;
      if (keys.current.has('ArrowUp')) corridor.goal += speed;
      if (keys.current.has('ArrowDown')) corridor.goal -= speed;
      corridor.goal = Math.max(0, Math.min(1, corridor.goal));
    }
    corridor.t = damp(corridor.t, corridor.goal, 0.08, delta);

    if (phase === 'corridor' && corridor.t >= 0.95) setPhase('map');

    const railZ = corridor.mouth + -LENGTH * corridor.t;
    let z = railZ;
    let fov = 48;
    if (phase === 'warp') {
      z = THREE.MathUtils.lerp(railZ, APSE_Z + 1.6, warp.p);
      fov = 48 + 30 * warp.p * warp.p;
    }

    // free look — wide enough to face either wall and read the canvases
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

    // the sun's shadow frustum follows the camera so the bars stay sharp
    if (sunRef.current) {
      const t = sunRef.current.target;
      t.position.set(0, 1.2, z - 6);
      t.updateMatrixWorld();
      sunRef.current.position.set(SUN_FROM.x, SUN_FROM.y, z - 6 + SUN_FROM.z);
      sunRef.current.updateMatrixWorld();
    }
  });

  return (
    <group>
      {/* polished floor — the long specular streaks are half the look */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -LENGTH / 2 - 1]} receiveShadow>
        <planeGeometry args={[7.2, LENGTH + 14]} />
        <MeshReflectorMaterial
          resolution={1024}
          blur={[400, 100]}
          mixBlur={0.8}
          mixStrength={0.7}
          roughness={0.2}
          depthScale={0.7}
          minDepthThreshold={0.4}
          color={PAL.floorLight}
          metalness={0.2}
          mirror={0.55}
        />
      </mesh>
      {[-2.6, 2.6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, -LENGTH / 2 - 1]}>
          <planeGeometry args={[0.18, LENGTH + 14]} />
          <meshStandardMaterial color={PAL.floorInlay} roughness={0.35} metalness={0.12} />
        </mesh>
      ))}

      {/* walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * HALF_W, WALL_H / 2, -LENGTH / 2 - 1]}
          rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[LENGTH + 14, WALL_H]} />
          <meshStandardMaterial color={PAL.field} roughness={0.8} />
        </mesh>
      ))}

      {/* continuous horizontals: skirting, dado rail, cornice (§10A.2) */}
      {[-1, 1].map((side) => (
        <group key={`bands${side}`}>
          <mesh position={[side * (HALF_W - 0.015), 0.07, -LENGTH / 2 - 1]} receiveShadow>
            <boxGeometry args={[0.06, 0.14, LENGTH + 14]} />
            <meshStandardMaterial color={PAL.highlight} roughness={0.75} />
          </mesh>
          <mesh position={[side * (HALF_W - 0.025), 1.07, -LENGTH / 2 - 1]} receiveShadow>
            <boxGeometry args={[0.1, 0.1, LENGTH + 14]} />
            <meshStandardMaterial color={PAL.highlight} roughness={0.75} />
          </mesh>
          <mesh position={[side * (HALF_W - 0.05), 5.44, -LENGTH / 2 - 1]} castShadow>
            <boxGeometry args={[0.2, 0.48, LENGTH + 14]} />
            <meshStandardMaterial color={PAL.highlight} roughness={0.72} />
          </mesh>
        </group>
      ))}

      {/* barrel vault — still the brightest large surface */}
      <mesh position={[0, WALL_H - 0.2, -LENGTH / 2 - 1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[3.5, 3.5, LENGTH + 14, 48, 1, true, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={PAL.vault} roughness={0.85} side={THREE.BackSide} />
      </mesh>
      <VaultRibs />

      <Pilasters />
      <Clerestory />
      <SunPools />
      <Bays />
      <PlinthsAndSculpture />

      {/* apse — deeper in tone, brighter in incident light */}
      <mesh position={[0, 4.25, APSE_Z]} receiveShadow>
        <planeGeometry args={[7.2, 10]} />
        <meshStandardMaterial color={PAL.apse} roughness={0.8} />
      </mesh>

      <Lamps />

      {/* the sun: low, warm, and the only shadow caster */}
      <directionalLight
        ref={sunRef}
        color="#FFD9A0"
        intensity={2.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
      {/* cool sky bounce filling the shadows, so nothing goes black */}
      <hemisphereLight args={['#CFE0F0', '#6E6250', 0.42]} />
    </group>
  );
}
