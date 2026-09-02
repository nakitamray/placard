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
import {
  ZOOM_MAX,
  ZOOM_MIN,
  corridor,
  nudgeZoom,
  pointer,
  resetCorridor,
  resetZoom,
  view,
  warp,
} from '../state/motion';
import { damp, dampK } from '../lib/damp';
import { flash } from '../ui/Flash';
import { OrnateFrame } from './OrnateFrame';
import { frameReach } from './frames';
import { fitWork } from './fit';
import { fallbackUrl, imageUrl } from '../lib/image';
import { Ceiling } from './corridor/Ceiling';
import { Floor, Walls } from './corridor/Surfaces';
import { Fixtures } from './corridor/Fixtures';
import { bayZ, dimsFor, hangHeight, type Dims } from './corridor/dims';
import { Atmosphere } from './corridor/Atmosphere';
import type { ArtworkIndexEntry, MuseumData } from '../types';
import type { Quality } from '../lib/quality';

/**
 * Wall textures, cached by artwork id for the life of the page.
 *
 * This hook is called from more than one component in the same scene, and a
 * TextureLoader per call site means the same ten thumbnails are fetched,
 * decoded and uploaded to the GPU once per caller. Caching by id makes
 * re-entering a museum free as well.
 *
 * A corridor is the only place where ten pictures load at once, so it is the
 * one place the format matters most: these are asked for as AVIF or WebP
 * where the browser can take them, which is most of a megabyte saved on the
 * way into a room, and stepped down to JPEG where it cannot.
 */
/**
 * Where the picture light is pointing, and how hard.
 *
 * A museum does not light a corridor evenly and then hope you find the
 * paintings; it drops the room and puts a light on each work. That is what
 * this is: when the cursor finds a canvas, the ambient light in the corridor
 * eases down and a narrow warm spot comes up on that one work.
 *
 * Kept as a plain mutable object rather than state because it is written on
 * pointer events and read every frame — routing it through React would
 * re-render the whole corridor to move a light.
 */
const picture = { on: false, x: 0, y: 0, z: 0 };

const wallTextures = new Map<string, THREE.Texture>();

function loadWallTexture(id: string): THREE.Texture {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const attempt = (url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
    };
    img.onerror = () => {
      const next = fallbackUrl(url);
      if (next) attempt(next);
    };
    img.src = url;
  };
  attempt(imageUrl(id, 'wall'));
  return tex;
}

function useArtworkTextures(artworks: ArtworkIndexEntry[]) {
  return useMemo(
    () =>
      artworks.map((a) => {
        const hit = wallTextures.get(a.id);
        if (hit) return hit;
        const t = loadWallTexture(a.id);
        wallTextures.set(a.id, t);
        return t;
      }),
    [artworks],
  );
}

/**
 * One hung painting: the accent panel it hangs against, its moulded frame, and
 * the canvas itself — all sharing a centre.
 */
function HungWork({
  artwork,
  index,
  texture,
  museum,
  width,
  height,
  showPanel = true,
  detail = 'full',
}: {
  artwork: ArtworkIndexEntry;
  /** position in the museum's running order — what clicking this opens */
  index: number;
  texture: THREE.Texture;
  museum: MuseumData;
  width: number;
  height: number;
  showPanel?: boolean;
  detail?: 'full' | 'plain';
}) {
  const canvasMat = useRef<THREE.MeshStandardMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const reach = frameReach(museum.style.frame) * height;

  /**
   * A painting you can see should be a painting you can open. Walking to the
   * far wall and going through the floor plan to reach a canvas already in
   * front of you is friction with nothing on the other side of it, so the
   * corridor lights a work under the cursor and lets you step into its room.
   */
  const lift = (on: boolean) => {
    document.body.style.cursor = on ? 'pointer' : '';
    if (canvasMat.current) {
      gsap.to(canvasMat.current, {
        emissiveIntensity: on ? 0.46 : 0.14,
        duration: 0.45,
        ease: 'power2.out',
      });
    }
    if (group.current) {
      gsap.to(group.current.scale, {
        x: on ? 1.035 : 1,
        y: on ? 1.035 : 1,
        z: 1,
        duration: 0.5,
        ease: 'power3.out',
      });
    }
  };

  const enter = () => {
    lift(true);
    if (group.current) {
      const p = group.current.getWorldPosition(new THREE.Vector3());
      picture.on = true;
      picture.x = p.x;
      picture.y = p.y;
      picture.z = p.z;
    }
    useStore.getState().setHoveredWork({
      index,
      artist: artwork.artist,
      title: artwork.title,
    });
  };
  const leave = () => {
    lift(false);
    picture.on = false;
    const s = useStore.getState();
    if (s.hoveredWork?.index === index) s.setHoveredWork(null);
  };
  const open = () => {
    const s = useStore.getState();
    if (s.phase !== 'corridor') return;
    picture.on = false;
    document.body.style.cursor = '';
    s.setHoveredWork(null);
    s.setIndex(index);
    s.setPhase('warp');
  };
  // The painter's ground, pulled most of the way toward the wall tone. At full
  // strength it reads as a coloured rectangle stuck on the wall, which no
  // gallery has; at this strength it is a tonal shift you notice only once you
  // are standing in front of it. The full accent belongs in the artwork room.
  const ground = useMemo(() => {
    const c = new THREE.Color(artwork.accent).lerp(new THREE.Color(museum.style.palette.wall), 0.66);
    return `#${c.getHexString()}`;
  }, [artwork.accent, museum.style.palette.wall]);

  return (
    <group ref={group}>
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
        detail={detail}
      />
      <mesh
        position={[0, 0, 0.028]}
        onPointerOver={(e) => {
          e.stopPropagation();
          enter();
        }}
        onPointerOut={leave}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          ref={canvasMat}
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
function Bays({
  museum,
  d,
  quality,
}: {
  museum: MuseumData;
  d: Dims;
  quality: Quality;
}) {
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
      // Hung larger than a real salon would: the corridor is walked past at
      // speed and the canvases are what it is for, so they take as much of
      // each bay as the moulding and the neighbours allow.
      const maxH = hang === 'salon' ? d.wallHeight * 0.34 : Math.min(2.45, d.wallHeight * 0.42);
      const main = fitWork(artworks[i].aspect, maxH, d.bayDepth * 0.86);
      // Carving is only legible close up. Past a few bays the bead course and
      // cartouches cost tens of thousands of triangles to render something
      // smaller than a pixel, so distant frames keep the turned courses only.
      const detail: 'full' | 'plain' =
        quality.ornament && bay < quality.detailBays ? 'full' : 'plain';

      nodes.push(
        <group key={`${bay}-${side}`} position={[x, 0, z]} rotation={[0, ry, 0]}>
          <group position={[0, centre, 0.05]}>
            <HungWork
              artwork={artworks[i]}
              index={i}
              texture={textures[i]}
              museum={museum}
              width={main.width}
              height={main.height}
              detail={detail}
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
                    index={j}
                    texture={textures[j]}
                    museum={museum}
                    width={small.width}
                    height={small.height}
                    showPanel={false}
                    detail="plain"
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
  const { width: aw, height: h } = fitWork(a.aspect, Math.min(3.0, d.wallHeight * 0.48), d.halfWidth * 1.35);

  return (
    <group>
      {/* sized to the room it closes — anything taller reads as a slab
          floating above the roofline rather than as the end of the corridor */}
      <mesh position={[0, (d.vaultHeight + 1) / 2, d.apseZ]} receiveShadow>
        <planeGeometry args={[d.halfWidth * 2.1, d.vaultHeight + 1]} />
        {museum.style.fixtures.glazedEnd ? (
          // a window, not a wall: the light at the end of the corridor is
          // outside, which is what makes a covered court read as a courtyard.
          // Tone-mapped, or an unclamped plane this size washes out the room.
          <meshBasicMaterial color={p.sky} />
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
          <mesh
            position={[0, 0, 0.028]}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => (document.body.style.cursor = '')}
            onClick={(e) => {
              e.stopPropagation();
              const st = useStore.getState();
              if (st.phase !== 'corridor') return;
              document.body.style.cursor = '';
              st.setIndex(artworks.indexOf(a));
              st.setPhase('warp');
            }}
          >
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
function Lamps({
  museum,
  d,
  quality,
}: {
  museum: MuseumData;
  d: Dims;
  quality: Quality;
}) {
  const l = museum.style.light;
  const lights: React.ReactNode[] = [];
  // Every point light is evaluated per fragment across every lit surface in
  // the room, so the count is a budget rather than a look: they are spread
  // evenly down the corridor and thinned rather than truncated.
  if (!museum.style.fixtures.chandeliers) {
    const step = Math.max(2, Math.ceil(d.bays / quality.maxLamps));
    for (let b = 0; b < d.bays; b += step) {
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

/**
 * The picture light.
 *
 * One spotlight for the whole corridor, moved to whichever work the cursor is
 * on. Fifty static spots would be fifty per-fragment light evaluations; one
 * that follows costs a single light and reads better, because it arrives with
 * the visitor's attention rather than sitting there all along.
 *
 * The room dims with it. Museums light this way — a dark gallery with lit
 * pictures — and the drop is small (twelve percent) because the corridor still
 * has to be walkable while a work is lit.
 */
function PictureLight({ museum, quality }: { museum: MuseumData; quality: Quality }) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useRef(new THREE.Object3D());
  const gl = useThree((s) => s.gl);
  const at = useRef(new THREE.Vector3(0, 2, 0));
  const level = useRef(0);
  const base = museum.style.light.exposure;

  useFrame((_, delta) => {
    const k = dampK(0.08, delta);
    level.current += ((picture.on ? 1 : 0) - level.current) * k;

    if (picture.on) {
      at.current.x += (picture.x - at.current.x) * k;
      at.current.y += (picture.y - at.current.y) * k;
      at.current.z += (picture.z - at.current.z) * k;
    }

    const s = spot.current;
    if (s) {
      // stand the lamp off the wall, on the room side of the work
      const side = at.current.x >= 0 ? 1 : -1;
      s.position.set(at.current.x - side * 1.15, at.current.y + 1.5, at.current.z + 0.2);
      target.current.position.copy(at.current);
      target.current.updateMatrixWorld();
      s.intensity = level.current * 34;
      s.visible = level.current > 0.01;
    }

    // the room steps back so the lit work steps forward
    gl.toneMappingExposure = base * (1 - 0.12 * level.current);
  });

  // this writes the exposure every frame, so it owns restoring it: leaving the
  // corridor with a work still lit would otherwise carry the dim into the
  // gallery, where nothing would ever put it back
  useEffect(() => () => {
    gl.toneMappingExposure = base;
  }, [gl, base]);

  return (
    <>
      <primitive object={target.current} />
      <spotLight
        ref={spot}
        target={target.current}
        color={museum.style.light.lamp}
        angle={0.42}
        penumbra={0.75}
        distance={7}
        decay={1.5}
        intensity={0}
        // a shadow-casting spot is a whole extra scene pass per frame; the
        // light reads perfectly well without one below the top budget
        castShadow={quality.name === 'high'}
        shadow-mapSize={[512, 512]}
      />
    </>
  );
}

export function CorridorScene({ quality }: { quality: Quality }) {
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

    view.v = damp(view.v, view.goal, 0.09, delta);

    const railZ = corridor.mouth + -d.length * corridor.t;
    let z = railZ;
    /*
     * Zoom is a change of lens, not a step forward.
     *
     * Walking the camera down the corridor to get closer would put the visitor
     * *inside* the row of paintings and past the one they were looking at.
     * Narrowing the field of view instead does what leaning in and squinting
     * does: the far end of the enfilade comes to you, the geometry stays put,
     * and a canvas four bays away becomes readable.
     */
    let fov = 48 / Math.max(0.5, view.v);
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


  return (
    <group>
      <Floor style={museum.style} d={d} quality={quality} />
      <Walls style={museum.style} d={d} quality={quality} />
      <Ceiling style={museum.style} d={d} />
      <Bays museum={museum} d={d} quality={quality} />
      <Fixtures style={museum.style} d={d} />
      {quality.atmosphere && (
        <Atmosphere style={museum.style} d={d} quality={quality.name} />
      )}
      <Apse museum={museum} d={d} />
      <Lamps museum={museum} d={d} quality={quality} />
      <PictureLight museum={museum} quality={quality} />

      {/* the key light — skylight, window or dusk, per museum, and the only
          shadow caster in the room */}
      <directionalLight
        ref={sunRef}
        color={l.key}
        intensity={l.keyIntensity}
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
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
