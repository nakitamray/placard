/**
 * CorridorScene — spec §10.2 / §10A.
 *
 * Procedural architecture: 12 bays × 4m, width 7m, walls to cornice at
 * 5.20m, barrel vault to 8.50m, terminal apse. One repeated module,
 * instanced elements, camera on rails (z = lerp(0, −48, t)) with damped
 * look-toward-cursor parallax (§10B). Light, warm and open — never dark
 * (§10A.6 brightness guardrail; palette from §10A.4).
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
const LENGTH = BAYS * BAY; // 48
const HALF_W = 3.5;
const WALL_H = 5.2;
const APSE_Z = -(LENGTH + 3.5);

const PAL = {
  field: '#E8DFD0',
  recess: '#E2D7C6',
  highlight: '#F2EBDF',
  vault: '#EFE8DB',
  apse: '#B9A88F',
  floorLight: '#E9E2D5',
  floorInlay: '#B9A991',
  plinth: '#2A2622',
  gilt: '#C9A227',
  marble: '#F4F0E8',
};

function WallPaintings() {
  const artworks = useStore((s) => s.artworks);
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return artworks.map((a) => {
      const t = loader.load(`/artworks/${a.id}/wall.jpg`);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  }, [artworks]);

  if (!artworks.length) return null;

  const nodes: React.ReactNode[] = [];
  for (let bay = 0; bay < BAYS; bay++) {
    const i = bay % artworks.length;
    const a = artworks[i];
    const h = 1.9;
    const w = h * a.aspect;
    const z = -(bay * BAY + BAY / 2);
    const side = bay % 2 === 0 ? 1 : -1; // alternate walls
    const x = side * (HALF_W - 0.07);
    const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    // painting centre line shared at 1.55m + a touch (spec §10A.2)
    nodes.push(
      <group key={bay} position={[x, 1.7, z]} rotation={[0, ry, 0]}>
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[w + 0.2, h + 0.2, 0.07]} />
          <meshStandardMaterial color={PAL.gilt} roughness={0.28} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0, 0.021]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={textures[i]} roughness={0.85} />
        </mesh>
      </group>,
    );
  }
  // terminal apse painting — the magnet (spec §10A.7)
  const a = artworks[1] ?? artworks[0];
  const h = 2.0;
  nodes.push(
    <group key="apse" position={[0, 1.9, APSE_Z + 0.06]}>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[h * a.aspect + 0.24, h + 0.24, 0.08]} />
        <meshStandardMaterial color={PAL.gilt} roughness={0.28} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[h * a.aspect, h]} />
        <meshStandardMaterial map={textures[1] ?? textures[0]} roughness={0.85} />
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
        mat.setPosition(side * (HALF_W - 0.06), WALL_H / 2, -b * BAY);
        m.setMatrixAt(i++, mat);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, (BAYS + 1) * 2]}>
      <boxGeometry args={[0.12, WALL_H, 0.5]} />
      <meshStandardMaterial color={PAL.highlight} roughness={0.72} />
    </instancedMesh>
  );
}

function BoiseriePanels() {
  // recessed panel + bolection reads as tone-on-tone rectangles (§10A.3)
  const panels = useRef<THREE.InstancedMesh>(null);
  const frames = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    let pi = 0;
    let fi = 0;
    for (let b = 0; b < BAYS; b++) {
      const z = -(b * BAY + BAY / 2);
      for (const side of [-1, 1]) {
        const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        q.setFromEuler(new THREE.Euler(0, ry, 0));
        // recessed field 2.60 × 3.40 centred at 2.85 (spec §10A.1/2)
        pos.set(side * (HALF_W - 0.005), 2.85, z);
        scl.set(1, 1, 1);
        mat.compose(pos, q, scl);
        panels.current!.setMatrixAt(pi++, mat);
        // bolection surround: four thin bars
        const bw = 2.6;
        const bh = 3.4;
        const t = 0.09;
        const segs: Array<[number, number, number, number]> = [
          [0, bh / 2, bw + t, t], // top (dx, dy, len, thick)
          [0, -bh / 2, bw + t, t],
          [-bw / 2, 0, t, bh + t],
          [bw / 2, 0, t, bh + t],
        ];
        for (const [dx, dy, lx, ly] of segs) {
          pos.set(side * (HALF_W - 0.04), 2.85 + dy, z + -side * 0 - dx * side);
          // local x of the wall plane maps to world -side*z? Keep simple:
          // bars run along z for horizontal segments after rotation
          scl.set(lx, ly, 1);
          mat.compose(pos, q, scl);
          frames.current!.setMatrixAt(fi++, mat);
        }
      }
    }
    panels.current!.instanceMatrix.needsUpdate = true;
    frames.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <>
      <instancedMesh ref={panels} args={[undefined, undefined, BAYS * 2]}>
        <planeGeometry args={[2.6, 3.4]} />
        <meshStandardMaterial color={PAL.recess} roughness={0.72} />
      </instancedMesh>
      <instancedMesh ref={frames} args={[undefined, undefined, BAYS * 2 * 4]}>
        <boxGeometry args={[1, 1, 0.05]} />
        <meshStandardMaterial color={PAL.highlight} roughness={0.7} />
      </instancedMesh>
    </>
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
      <torusGeometry args={[3.42, 0.08, 8, 32, Math.PI]} />
      <meshStandardMaterial color={PAL.highlight} roughness={0.7} />
    </instancedMesh>
  );
}

function PlinthsAndSculpture() {
  // odd bays, left side only, for asymmetry (spec §10A.1)
  const nodes: React.ReactNode[] = [];
  for (let b = 1; b < BAYS; b += 2) {
    const z = -(b * BAY + BAY / 2);
    const s = 1 + ((b * 37) % 17) / 100 - 0.08; // vary scale ±8%
    nodes.push(
      <group key={b} position={[-(HALF_W - 0.85), 0, z]} scale={[s, s, s]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[0.55, 1.1, 0.55]} />
          <meshStandardMaterial color={PAL.plinth} roughness={0.55} />
        </mesh>
        {/* abstracted marble figure — CC0 scans stand-in */}
        <group position={[0, 1.1, 0]} rotation={[0, (b * 0.9) % Math.PI, 0]}>
          <mesh position={[0, 0.42, 0]}>
            <capsuleGeometry args={[0.16, 0.5, 6, 12]} />
            <meshStandardMaterial color={PAL.marble} roughness={0.42} />
          </mesh>
          <mesh position={[0.02, 0.86, 0]}>
            <sphereGeometry args={[0.12, 16, 12]} />
            <meshStandardMaterial color={PAL.marble} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
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
  // warm points at cornice height; apse spot is the magnet (spec §10A.5/7)
  const lights: React.ReactNode[] = [];
  for (let b = 0; b < BAYS; b += 2) {
    const z = -(b * BAY + BAY / 2);
    lights.push(
      <pointLight
        key={b}
        position={[0, WALL_H - 0.1, z]}
        color={LAMP}
        intensity={14}
        distance={13}
        decay={1.8}
      />,
    );
  }
  return (
    <>
      {lights}
      {/* apse pool — intensity 22-equivalent, the visual magnet */}
      <pointLight position={[0, 3.4, APSE_Z + 1.6]} color={LAMP} intensity={26} distance={11} decay={1.7} />
      <pointLight position={[0, 0.7, APSE_Z + 2.4]} color={LAMP} intensity={7} distance={7} decay={2} />
    </>
  );
}

export function CorridorScene() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const phase = useStore((s) => s.phase);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setPhase = useStore((s) => s.setPhase);
  const look = useRef({ x: 0, y: 0 });

  // scroll → corridor.target (Lenis-style damping applied in useFrame)
  useEffect(() => {
    if (phase !== 'corridor') return;
    const onWheel = (e: WheelEvent) => {
      corridor.target = Math.max(0, Math.min(1, corridor.target + e.deltaY * 0.00045));
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => {
      const dy = touchY - e.touches[0].clientY;
      touchY = e.touches[0].clientY;
      corridor.target = Math.max(0, Math.min(1, corridor.target + dy * 0.0018));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') corridor.target += reducedMotion ? 0.2 : 0.08;
      if (e.key === 'ArrowUp' || e.key === 'PageUp') corridor.target -= reducedMotion ? 0.2 : 0.08;
      corridor.target = Math.max(0, Math.min(1, corridor.target));
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase, reducedMotion]);

  // T1 portal tail: camera dollies from the corridor mouth (z=4) to the rails
  useEffect(() => {
    if (phase === 'corridor' && corridor.mouth > 0.01) {
      gsap.to(corridor, {
        mouth: 0,
        duration: reducedMotion ? 0.2 : 1.2,
        ease: 'power2.inOut',
      });
    }
    if (phase === 'landing') {
      corridor.mouth = 4;
      resetCorridor(0);
    }
  }, [phase, reducedMotion]);

  // T3 warp: map → gallery through the apse (spec §11)
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
    // belt and braces: the machine guard makes this a no-op when the
    // timeline already completed, but it guarantees the warp can't strand
    // the user if the ticker hiccups (e.g. a background tab)
    const failsafe = window.setTimeout(
      () => setPhase('gallery'),
      reducedMotion ? 700 : 2200,
    );
    return () => {
      tl.kill();
      window.clearTimeout(failsafe);
    };
  }, [phase, reducedMotion, setPhase]);

  useFrame((_, delta) => {
    // damped scroll (spec: Lenis-style; §10B.2 universal damping)
    corridor.t = damp(corridor.t, corridor.target, 0.08, delta);

    // T2 trigger
    if (phase === 'corridor' && corridor.t >= 0.95) setPhase('map');

    const railZ = corridor.mouth + -LENGTH * corridor.t;
    let z = railZ;
    let fov = 45;
    if (phase === 'warp') {
      z = THREE.MathUtils.lerp(railZ, APSE_Z + 1.6, warp.p);
      fov = 45 + 28 * warp.p * warp.p;
    }

    // pointer parallax — damped, ±3° yaw, ±1.5° pitch, ±0.12m x (spec §10B.3)
    const k = dampK(0.06, delta);
    const px = reducedMotion || phase === 'map' ? 0 : pointer.x;
    const py = reducedMotion || phase === 'map' ? 0 : pointer.y;
    look.current.x += (px - look.current.x) * k;
    look.current.y += (py - look.current.y) * k;

    camera.position.set(look.current.x * 0.12, 1.6, z);
    camera.rotation.set(
      -look.current.y * (1.5 * Math.PI) / 180,
      -look.current.x * (3.0 * Math.PI) / 180,
      0,
    );
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return (
    <group>
      {/* floor — the polished reflection is load-bearing (spec §10A.4) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -LENGTH / 2 - 1]}>
        <planeGeometry args={[7.2, LENGTH + 14]} />
        <MeshReflectorMaterial
          resolution={1024}
          blur={[400, 100]}
          mixBlur={0.75}
          mixStrength={0.55}
          roughness={0.15}
          depthScale={0.6}
          minDepthThreshold={0.4}
          color={PAL.floorLight}
          metalness={0.15}
          mirror={0.5}
        />
      </mesh>
      {/* inlay bands toward the vanishing point */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.6, 0.005, -LENGTH / 2 - 1]}>
        <planeGeometry args={[0.18, LENGTH + 14]} />
        <meshStandardMaterial color={PAL.floorInlay} roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.6, 0.005, -LENGTH / 2 - 1]}>
        <planeGeometry args={[0.18, LENGTH + 14]} />
        <meshStandardMaterial color={PAL.floorInlay} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * HALF_W, WALL_H / 2, -LENGTH / 2 - 1]}
          rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
        >
          <planeGeometry args={[LENGTH + 14, WALL_H]} />
          <meshStandardMaterial color={PAL.field} roughness={0.72} />
        </mesh>
      ))}

      {/* skirting / dado rail / cornice — continuous horizontals (spec §10A.2) */}
      {[-1, 1].map((side) => (
        <group key={`bands${side}`}>
          <mesh position={[side * (HALF_W - 0.015), 0.07, -LENGTH / 2 - 1]}>
            <boxGeometry args={[0.06, 0.14, LENGTH + 14]} />
            <meshStandardMaterial color={PAL.highlight} roughness={0.7} />
          </mesh>
          <mesh position={[side * (HALF_W - 0.025), 1.07, -LENGTH / 2 - 1]}>
            <boxGeometry args={[0.1, 0.1, LENGTH + 14]} />
            <meshStandardMaterial color={PAL.highlight} roughness={0.7} />
          </mesh>
          <mesh position={[side * (HALF_W - 0.05), 5.44, -LENGTH / 2 - 1]}>
            <boxGeometry args={[0.2, 0.48, LENGTH + 14]} />
            <meshStandardMaterial color={PAL.highlight} roughness={0.68} />
          </mesh>
        </group>
      ))}

      {/* barrel vault — the brightest large surface (spec §10A.6) */}
      <mesh position={[0, WALL_H - 0.2, -LENGTH / 2 - 1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[3.5, 3.5, LENGTH + 14, 48, 1, true, Math.PI / 2, Math.PI]}
        />
        <meshStandardMaterial color={PAL.vault} roughness={0.8} side={THREE.BackSide} />
      </mesh>
      <VaultRibs />

      <Pilasters />
      <BoiseriePanels />
      <WallPaintings />
      <PlinthsAndSculpture />

      {/* apse — deeper in tone, brighter in incident light (spec §10A.7) */}
      <mesh position={[0, 4.25, APSE_Z]}>
        <planeGeometry args={[7.2, 10]} />
        <meshStandardMaterial color={PAL.apse} roughness={0.72} />
      </mesh>

      <Lamps />
    </group>
  );
}
