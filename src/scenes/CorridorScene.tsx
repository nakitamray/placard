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
import { fallbackUrl, imageUrl } from '../lib/image';
import { Ceiling } from './corridor/Ceiling';
import { Floor, Walls } from './corridor/Surfaces';
import { Fixtures } from './corridor/Fixtures';
import { bayZ, dimsFor, hangHeight, workMaxHeight, type Dims } from './corridor/dims';
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
const wallTextures = new Map<string, THREE.Texture>();

function loadWallTexture(id: string): THREE.Texture {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  /*
   * Anisotropy matters more here than anywhere else in the exhibition. Every
   * painting in a corridor is seen at a glancing angle — that is what a
   * corridor is — and at 4× the far half of each canvas smears into mush that
   * no amount of source resolution can fix. 16 is free on anything made this
   * decade and is the difference between a painting and a smudge.
   */
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
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
    useStore.getState().setHoveredWork({
      index,
      artist: artwork.artist,
      title: artwork.title,
    });
  };
  const leave = () => {
    lift(false);
    const s = useStore.getState();
    if (s.hoveredWork?.index === index) s.setHoveredWork(null);
  };
  const open = () => {
    const s = useStore.getState();
    if (s.phase !== 'corridor') return;
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
 * The centre of a work hung inside one of the court's arched openings: above
 * the sill the arcade stands on, below the springing of the arch.
 */
const ARCH_HANG_Y = 1.66;

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
      const maxH = workMaxHeight(d, museum.style);
      // The Met court's engaged columns stand on the bay divisions and project
      // a third of a metre off the wall, so a canvas hung there gets a
      // narrower bay than one on a flat pilastered wall — otherwise the frame
      // runs into the shaft that is supposed to be separating it from its
      // neighbour.
      const clear = museum.style.wall === 'court-facade' ? 0.6 : 0.78;
      const main = fitWork(artworks[i].aspect, maxH, d.bayDepth * clear);
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

    /*
     * The Met court hangs one wall per bay, which leaves the arcade opposite
     * holding nothing but a dark recess — ten of them down the room, reading
     * as ten doorways to nowhere. A smaller work goes inside each opening.
     *
     * They are drawn from further along the running order than the bay's own
     * work, so walking the court shows you more of the collection than the
     * five canvases the alternating hang would otherwise give you, and every
     * one of them opens its room like any other painting.
     */
    if (museum.style.wall === 'court-facade' && hang === 'alternating') {
      const side: 1 | -1 = bay % 2 === 0 ? -1 : 1;
      const brick = side > 0;
      const radius = brick ? 1.15 : 0.95;
      const j = (bay + Math.ceil(artworks.length / 2)) % artworks.length;
      // inside the opening, clear of the voussoirs and standing on the sill
      const inArch = fitWork(artworks[j].aspect, 1.42, radius * 1.56);
      nodes.push(
        <group
          key={`arch-${bay}`}
          position={[side * (d.halfWidth - 0.09), 0, z]}
          rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
        >
          <group position={[0, ARCH_HANG_Y, 0.05]}>
            <HungWork
              artwork={artworks[j]}
              index={j}
              texture={textures[j]}
              museum={museum}
              width={inArch.width}
              height={inArch.height}
              showPanel={false}
              detail="plain"
            />
          </group>
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

/* ─── how far one press of an arrow key walks you ──────────────────────────
   A single tap used to hand the visitor a fifth of the corridor, which made
   the whole rail feel like it was on castors. A tap is now a step: a fixed
   small nudge on keydown, then — only if the key stays down — a walk that
   eases up to speed. Distance is measured in rail units, where 1 is the
   whole corridor. */
/** one short press */
const TAP_STEP = 0.012;
/** grace before a press counts as a hold, in seconds */
const WALK_DELAY = 0.18;
/** how long the walk takes to reach full speed, in seconds */
const WALK_RAMP = 1.6;
/** rail units per second, at the start of a hold and at full stride */
const WALK_MIN = 0.12;
const WALK_MAX = 0.6;

export function CorridorScene({ quality }: { quality: Quality }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const phase = useStore((s) => s.phase);
  const museum = useStore((s) => s.museum);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setPhase = useStore((s) => s.setPhase);
  const look = useRef({ x: 0, y: 0 });
  const keys = useRef<Set<string>>(new Set());
  /** when the current arrow-key hold began, so a tap and a hold differ */
  const heldSince = useRef(0);
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
        sprint.current?.kill();
        // A tap is a step, not a lunge. The auto-repeat events the OS sends
        // while a key is held must not each count as a fresh step, so only
        // the first keydown moves the goal; from there the frame loop takes
        // over and eases into a walk.
        if (!e.repeat) {
          corridor.goal += e.key === 'ArrowUp' ? TAP_STEP : -TAP_STEP;
          clamp();
          heldSince.current = performance.now();
        }
        keys.current.add(e.key);
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
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key);
      if (!keys.current.size) heldSince.current = 0;
    };
    const onBlur = () => {
      keys.current.clear();
      heldSince.current = 0;
    };

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
      // Held: ease from a slow walk up to a stride, so the length of the press
      // is what decides the distance. A short press is the step already taken
      // on keydown plus a few centimetres of this; a long one crosses the
      // corridor in a few seconds.
      const held = heldSince.current ? (performance.now() - heldSince.current) / 1000 : 0;
      const ramp = Math.min(1, Math.max(0, (held - WALK_DELAY) / WALK_RAMP));
      const speed = (WALK_MIN + (WALK_MAX - WALK_MIN) * ramp * ramp) * Math.min(delta, 0.05);
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
