/**
 * GalleryScene
 *
 * The room you are in when you are looking at one painting.
 *
 * Two things carry the identity of the work here. The first is the
 * architecture: every canvas sits inside a full moulded bay — fluted pilasters
 * either side, an entablature and cornice above, a dado and skirting below,
 * and a raised bolection panel behind the frame — rather than hanging on a
 * bare plane. The second is colour: the entire room, walls, coffers, floor
 * tint, fill light, fog and background, takes the painter's own accent, and
 * eases from one to the next as you move along the rail. You can tell whose
 * room you are standing in with your eyes half shut.
 *
 * Horizontal roll: artwork bays along +x, spacing 8, camera x = damped scroll
 * with magnetic snap. Exactly one plane renders live glyphs (the nearest).
 *
 * HOVER LOOKS, CLICK DECIDES. Moving over a canvas opens the reading lens — a
 * soft circle of paint dragged across the field of words — and does nothing
 * else. Clicking dissolves the whole work, brings the wall label and slides
 * the room aside to make room for it. Esc or scroll closes it again.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { selectArtworks, useStore } from '../state/store';
import { gallery, pointer, view } from '../state/motion';
import { damp, dampK } from '../lib/damp';
import { GlyphPrePass } from '../glyph/GlyphPrePass';
import { loadReveal, prefetchAround, type LoadedArtwork } from '../glyph/artworkLoader';
import { ArtworkPlane } from './ArtworkPlane';
import { OrnateFrame } from './OrnateFrame';
import { frameReach } from './frames';
import { fitWork } from './fit';
import { startReveal, endReveal, revealAnim } from '../transitions/reveal';
import { closeLens, moveLens } from '../transitions/lens';
import { discoverWork } from '../state/atlas';
import { artworkProjector, regionAt } from '../threadpull/state';
import type { ArtworkIndexEntry, DeviceTier, MuseumData } from '../types';
import type { Quality } from '../lib/quality';

const SPACING = 8;
/**
 * How far back the camera stands, and how big the canvas is drawn.
 *
 * These four numbers are one decision: how much of the screen the painting
 * gets against how much of it the room gets. A visitor who has walked down a
 * corridor and chosen this painting should be looking at the painting, so the
 * canvas wins — a moulding wrapped round a work that only fills three fifths
 * of the frame leaves the picture itself at barely half.
 */
const CAM_Z = 5.2;
/** the height a work is hung at unless it is too wide to allow it */
export const PLANE_H = 2.55;
/** widest a work may be drawn before its height gives way (spec: fit.ts) */
const MAX_W = 6.2;
/** height every canvas is centred on */
export const HANG_Y = 2.15;
const WALL_H = 6.2;

/**
 * The reading lens, as a fraction of the canvas's short edge.
 *
 * Smaller than the landing hero's, because the canvas here already fills most
 * of the screen: what wants to read as an aperture held over the picture
 * would, at the hero's radius, read as the painting simply coming back.
 */
const LENS_RADIUS = 0.26;

/** screen-space projection of the active plane for the DOM placard */
export const placardAnchor = { x: 0, y: 0, edge: 0, visible: false };

/* ── the moulded bay around one painting ────────────────────────────────── */

/** vertical flutes cut into a pilaster shaft */
function Flutes({ height, width }: { height: number; width: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 4;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      m.makeTranslation((i / (COUNT - 1) - 0.5) * width * 0.62, 0, width * 0.19);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [height, width]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[width * 0.09, height * 0.82, width * 0.1]} />
      <meshStandardMaterial color="#00000022" roughness={0.9} transparent opacity={0.16} />
    </instancedMesh>
  );
}

/**
 * The joinery around one work: pilasters, entablature, cornice, dado,
 * skirting and a raised panel. Everything is tinted from the painter's accent,
 * so the room is theirs and the mouldings still read as mouldings.
 */
function MouldedBay({
  artwork,
  museum,
  width,
  height,
}: {
  artwork: ArtworkIndexEntry;
  museum: MuseumData;
  width: number;
  height: number;
}) {
  const accent = artwork.accent;
  const p = museum.style.palette;

  // Mouldings are the accent lightened — never neutral. Taken too far toward
  // the museum's stone colour the joinery washes out to bone and the room
  // stops belonging to the painter, which is the one thing it has to do.
  const tint = useMemo(() => {
    const base = new THREE.Color(accent);
    const light = base.clone().lerp(new THREE.Color(p.molding), 0.36);
    const deep = base.clone().lerp(new THREE.Color('#000000'), 0.28);
    const mid = base.clone().lerp(new THREE.Color(p.molding), 0.14);
    return {
      light: `#${light.getHexString()}`,
      deep: `#${deep.getHexString()}`,
      mid: `#${mid.getHexString()}`,
    };
  }, [accent, p.molding]);

  const reach = frameReach(museum.style.frame) * height;
  const panelW = width + reach * 2 + 0.55;
  const panelH = height + reach * 2 + 0.55;
  const pilasterX = panelW / 2 + 0.42;
  const pilasterH = 4.35;
  const bayW = pilasterX * 2 + 0.84;

  return (
    <group>
      {/* the field of the bay, in the painter's colour */}
      <mesh position={[0, WALL_H / 2 - 0.4, -0.06]} receiveShadow>
        <planeGeometry args={[SPACING, WALL_H]} />
        <meshStandardMaterial color={accent} roughness={0.92} />
      </mesh>

      {/* raised bolection panel the painting sits in the middle of */}
      <mesh position={[0, HANG_Y, -0.04]} receiveShadow>
        <boxGeometry args={[panelW + 0.34, panelH + 0.34, 0.05]} />
        <meshStandardMaterial color={tint.light} roughness={0.72} />
      </mesh>
      <mesh position={[0, HANG_Y, -0.014]} receiveShadow>
        <boxGeometry args={[panelW, panelH, 0.04]} />
        <meshStandardMaterial color={tint.deep} roughness={0.9} />
      </mesh>

      {/* pilasters flanking the work */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * pilasterX, 0, 0.02]}>
          <mesh position={[0, pilasterH / 2, 0.1]} castShadow receiveShadow>
            <boxGeometry args={[0.5, pilasterH, 0.2]} />
            <meshStandardMaterial color={tint.light} roughness={0.7} />
          </mesh>
          <group position={[0, pilasterH / 2, 0.1]}>
            <Flutes height={pilasterH} width={0.5} />
          </group>
          {/* capital and base */}
          <mesh position={[0, pilasterH - 0.13, 0.14]} castShadow>
            <boxGeometry args={[0.72, 0.26, 0.3]} />
            <meshStandardMaterial color={tint.light} roughness={0.66} />
          </mesh>
          <mesh position={[0, 0.16, 0.14]} castShadow>
            <boxGeometry args={[0.68, 0.32, 0.3]} />
            <meshStandardMaterial color={tint.light} roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* entablature and cornice spanning the bay */}
      <mesh position={[0, pilasterH + 0.24, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[bayW, 0.44, 0.34]} />
        <meshStandardMaterial color={tint.light} roughness={0.68} />
      </mesh>
      <mesh position={[0, pilasterH + 0.56, 0.26]} castShadow>
        <boxGeometry args={[bayW + 0.3, 0.22, 0.52]} />
        <meshStandardMaterial color={tint.light} roughness={0.64} />
      </mesh>
      {/* a run of dentils under the cornice — the detail that reads as carving */}
      <Dentils width={bayW} y={pilasterH + 0.02} color={tint.light} />

      {/* frieze panel above the entablature, in the deeper tone */}
      <mesh position={[0, pilasterH + 1.15, -0.02]}>
        <planeGeometry args={[bayW - 0.4, 0.9]} />
        <meshStandardMaterial color={tint.deep} roughness={0.9} />
      </mesh>

      {/* skirting only — a dado rail at this scale runs straight across the
          bottom of the canvas, so the wall below the panel stays plain */}
      <mesh position={[0, 0.16, 0.02]}>
        <planeGeometry args={[SPACING, 0.32]} />
        <meshStandardMaterial color={tint.mid} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.1, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[SPACING, 0.2, 0.18]} />
        <meshStandardMaterial color={tint.light} roughness={0.72} />
      </mesh>

      {/* coffer directly overhead, so the ceiling belongs to the bay too */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H - 0.02, 2.0]}>
        <planeGeometry args={[bayW, 3.6]} />
        <meshStandardMaterial color={tint.deep} roughness={0.92} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H - 0.12, 2.0]}>
        <ringGeometry args={[1.2, 1.44, 24]} />
        <meshStandardMaterial color={tint.light} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Dentils({ width, y, color }: { width: number; y: number; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = Math.max(6, Math.round(width / 0.26));
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation((i / (count - 1) - 0.5) * (width - 0.2), y, 0.22);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, width, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
      <boxGeometry args={[0.12, 0.16, 0.16]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </instancedMesh>
  );
}

/* ── the scene ──────────────────────────────────────────────────────────── */

export function GalleryScene({ tier, quality }: { tier: DeviceTier; quality: Quality }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const museum = useStore((s) => s.museum);
  const artworks = useStore(selectArtworks);
  const index = useStore((s) => s.index);
  const revealed = useStore((s) => s.revealed);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setIndex = useStore((s) => s.setIndex);

  const [loaded, setLoaded] = useState<Map<number, LoadedArtwork>>(new Map());
  const spotRef = useRef<THREE.SpotLight>(null);
  const fillRef = useRef<THREE.HemisphereLight>(null);
  const spotTarget = useRef<THREE.Object3D>(new THREE.Object3D());
  const look = useRef({ x: 0, y: 0 });
  /** how far the room slides aside to make room for the wall label */
  const shift = useRef(0);
  const touch = useRef({ x: 0, active: false });
  const roomTone = useRef(new THREE.Color('#3A3630'));

  // load current + warm zone. The work in front of the visitor
  // loads immediately; its neighbours wait for an idle moment, so a prefetch
  // never delays the only painting on screen.
  useEffect(() => {
    if (!artworks.length) return;
    const ids = artworks.map((a) => a.id);
    return prefetchAround(ids, index, tier, (i, art) =>
      setLoaded((m) => (m.has(i) ? m : new Map(m).set(i, art))),
    );
  }, [artworks, index, tier]);

  /*
   * The reproduction is fetched here and nowhere else.
   *
   * Until a reveal is asked for, the only picture of a work the browser has
   * downloaded is its 512px corridor texture — which is what the canvas shows
   * behind the text, and what the reveal crossfades out of. Revealing asks for
   * the 1200px rung, which is larger than the canvas is ever drawn; if the
   * visitor is still standing there a second later, and the device has the
   * pixels to show it, the 2000px one follows.
   */
  useEffect(() => {
    if (!revealed) return;
    const art = loaded.get(index);
    if (!art) return;
    // `view` first because it lands sooner, then the full reproduction close
    // behind it: the canvas fills most of the screen here, and 1200px across
    // a 1400px picture is exactly the softness this was being blamed for.
    void loadReveal(art, 'view');
    if (tier.name !== 'high') return;
    const upgrade = window.setTimeout(() => void loadReveal(art, 'full'), 250);
    return () => window.clearTimeout(upgrade);
  }, [revealed, index, loaded, tier]);

  /*
   * The lens belongs to the canvas under the cursor and to nothing else.
   *
   * Moving along the rail, leaving the room, or switching into thread mode all
   * have to shut it, or a circle of paint hangs over a work the cursor has
   * left.
   */
  useEffect(() => {
    closeLens();
    return closeLens;
  }, [index]);

  // rail input: wheel / drag / arrows; scroll exits a reveal
  useEffect(() => {
    gallery.goal = index * SPACING;
    gallery.x = index * SPACING;
    const wheelEnd = { t: 0 };
    const onWheel = (e: WheelEvent) => {
      const s = useStore.getState();
      // a wheel inside a panel is scrolling that panel, not moving the room
      if ((e.target as Element | null)?.closest?.('.placard, .thread-panel, .credits')) return;
      if (s.revealed) endReveal(s.reducedMotion);
      gallery.goal += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.01;
      gallery.goal = Math.max(-1.5, Math.min((artworks.length - 1) * SPACING + 1.5, gallery.goal));
      wheelEnd.t = performance.now();
      // magnetic snap after the wheel settles
      setTimeout(() => {
        if (performance.now() - wheelEnd.t < 140) return;
        const i = Math.round(gallery.goal / SPACING);
        const clamped = Math.max(0, Math.min(artworks.length - 1, i));
        gsap.to(gallery, { goal: clamped * SPACING, duration: 0.5, ease: 'power3.out' });
        if (clamped !== useStore.getState().index) setIndex(clamped);
      }, 150);
    };
    const onTouchStart = (e: TouchEvent) => {
      touch.current = { x: e.touches[0].clientX, active: true };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touch.current.active) return;
      const dx = touch.current.x - e.touches[0].clientX;
      touch.current.x = e.touches[0].clientX;
      gallery.goal += dx * 0.02;
    };
    const onTouchEnd = () => {
      touch.current.active = false;
      const i = Math.max(0, Math.min(artworks.length - 1, Math.round(gallery.goal / SPACING)));
      gsap.to(gallery, { goal: i * SPACING, duration: 0.5, ease: 'power3.out' });
      if (i !== useStore.getState().index) setIndex(i);
    };
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = Math.min(artworks.length - 1, s.index + 1);
      if (e.key === 'ArrowLeft') next = Math.max(0, s.index - 1);
      if (next !== null && next !== s.index) {
        if (s.revealed) endReveal(s.reducedMotion);
        setIndex(next);
        gsap.to(gallery, {
          goal: next * SPACING,
          duration: s.reducedMotion ? 0.05 : 0.7,
          ease: 'expo.out',
        });
      }
      // Enter is the keyboard's click: it opens the whole painting, and
      // pressing it again closes it, exactly as clicking the canvas does
      if (e.key === 'Enter') {
        s.revealed ? endReveal(s.reducedMotion) : startReveal(s.reducedMotion, true);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks.length, setIndex]);

  // rail-tick jumps from the DOM indicator
  useEffect(() => {
    const onJump = () => {
      const s = useStore.getState();
      gsap.to(gallery, {
        goal: s.index * SPACING,
        duration: s.reducedMotion ? 0.05 : 0.7,
        ease: 'expo.out',
      });
    };
    return useStore.subscribe((s) => s.index, onJump);
  }, []);

  useFrame((state, delta) => {
    gallery.x = damp(gallery.x, gallery.goal, 0.09, delta);

    // pointer parallax, damped
    const k = dampK(0.06, delta);
    const px = reducedMotion ? 0 : pointer.x;
    const py = reducedMotion ? 0 : pointer.y;
    look.current.x += (px - look.current.x) * k;
    look.current.y += (py - look.current.y) * k;

    /*
     * Zoom here is a step toward the canvas, not a change of lens: in a room
     * with one painting in it, getting closer is what you would actually do,
     * and it keeps the perspective of the moulding honest as you approach.
     * The floor of 1.55m stops the camera walking through the frame.
     */
    view.v = damp(view.v, view.goal, 0.09, delta);
    const dz = Math.max(1.55, CAM_Z / view.v);

    /*
     * Step aside for the label.
     *
     * The canvas is drawn large enough now that a 380px card at the right of
     * the screen lands on top of it. Rather than shrink the painting back
     * down — the thing this iteration set out to fix — the room slides a
     * little to the left while the label is open, which is what you do in a
     * gallery anyway: you stand off to one side to read the wall text.
     */
    const wantShift = revealed && size.width > 900 ? Math.min(1.35, (dz * 0.3) / view.v) : 0;
    shift.current = damp(shift.current, wantShift, 0.11, delta);

    camera.position.set(
      gallery.x + shift.current + look.current.x * 0.1,
      1.96 + look.current.y * -0.05,
      dz,
    );
    camera.rotation.set(
      (-look.current.y * 1.2 * Math.PI) / 180,
      (-look.current.x * 2.0 * Math.PI) / 180,
      0,
    );
    if (camera.fov !== 45) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }

    // the room takes the painter's colour, eased so moving along the rail is a
    // slow wash from one artist's ground to the next rather than a cut
    const nearest = artworks[Math.round(gallery.x / SPACING)] ?? artworks[index];
    if (nearest) {
      const target = new THREE.Color(nearest.accent);
      roomTone.current.lerp(target, Math.min(1, delta * 2.4));
      const bg = roomTone.current.clone().multiplyScalar(0.34);
      if (state.scene.background instanceof THREE.Color) state.scene.background.copy(bg);
      const fog = state.scene.fog as THREE.Fog | null;
      if (fog) fog.color.copy(bg);
      if (fillRef.current) {
        fillRef.current.color.copy(roomTone.current).lerp(new THREE.Color('#FFF3E0'), 0.55);
        fillRef.current.groundColor.copy(roomTone.current).multiplyScalar(0.7);
      }
    }

    // spotlight follows + intensifies on reveal
    if (spotRef.current) {
      spotRef.current.position.set(index * SPACING, 4.6, 2.4);
      spotTarget.current.position.set(index * SPACING, HANG_Y, 0);
      spotTarget.current.updateMatrixWorld();
      spotRef.current.intensity = revealAnim.spot * 3.4;
    }
    scene.environmentIntensity = 0.45 * revealAnim.env;

    // project the active plane edge for the DOM placard
    const activeEntry = artworks[index];
    if (activeEntry) {
      const { width: w, height: h } = fitWork(activeEntry.aspect, PLANE_H, MAX_W);
      const v = new THREE.Vector3(index * SPACING + w / 2, HANG_Y, 0.1);
      v.project(camera);
      placardAnchor.x = (v.x * 0.5 + 0.5) * size.width;
      placardAnchor.y = (-v.y * 0.5 + 0.5) * size.height;
      placardAnchor.visible = true;

      // Thread Pull: image space (u,v normalised, y-down) → viewport pixels.
      // Recomputed from the live camera on every call, so a resize mid-flight
      // simply produces new coordinates rather than a stale cached path.
      artworkProjector.project = (u: number, vv: number) => {
        const p = new THREE.Vector3(
          index * SPACING + (u - 0.5) * w,
          HANG_Y + (0.5 - vv) * h,
          0.05,
        );
        p.project(camera);
        return {
          x: (p.x * 0.5 + 0.5) * size.width,
          y: (-p.y * 0.5 + 0.5) * size.height,
        };
      };
    }
  });

  const activeArt = loaded.get(index) ?? null;
  if (!museum) return null;
  const p = museum.style.palette;
  const railW = artworks.length * SPACING + 24;
  const centreX = ((artworks.length - 1) * SPACING) / 2;

  return (
    <group>
      <GlyphPrePass artwork={activeArt} rtSize={tier.rtSize} active />

      {/* the wall behind the bays, and the ceiling over them */}
      <mesh position={[centreX, WALL_H / 2, -0.14]}>
        <planeGeometry args={[railW, WALL_H + 2]} />
        <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[centreX, WALL_H, 2]}>
        <planeGeometry args={[railW, 14]} />
        <meshStandardMaterial color={p.ceiling} roughness={0.9} />
      </mesh>
      {/* opposite wall, far behind the camera — the true-3D parallax layer */}
      <mesh position={[centreX, WALL_H / 2, 10.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[railW, WALL_H + 2]} />
        <meshStandardMaterial color={p.wallDeep} roughness={0.9} />
      </mesh>
      {/* reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centreX, 0, 2]}>
        <planeGeometry args={[railW, 14]} />
        {/* see the note in corridor/Surfaces.tsx: reflections are a second
            full render of the scene, so they are the top budget only */}
        {quality.reflections ? (
          <MeshReflectorMaterial
            resolution={quality.reflectionRes}
            blur={[400, 100]}
            mixBlur={0.75}
            mixStrength={0.5}
            roughness={0.18}
            depthScale={0.6}
            minDepthThreshold={0.4}
            color={p.floor}
            metalness={0.12}
            mirror={0.45}
          />
        ) : (
          <meshStandardMaterial
            color={p.floor}
            roughness={0.4}
            metalness={0.2}
            envMapIntensity={1.2}
          />
        )}
      </mesh>

      {/* one fully moulded bay per painting */}
      {artworks.map((a, i) => {
        // a tondo is square whatever its scan measures, and the frame is
        // turned rather than mitred
        const { width, height } = fitWork(a.shape === 'round' ? 1 : a.aspect, PLANE_H, MAX_W);
        return (
          <group key={`bay${a.id}`} position={[i * SPACING, 0, 0]}>
            <MouldedBay artwork={a} museum={museum} width={width} height={height} />
            <group position={[0, HANG_Y, 0.06]}>
              <OrnateFrame
                kind={museum.style.frame}
                width={width}
                height={height}
                gilt={p.gilt}
                dark={p.wallDeep}
                shape={a.shape}
                detail={
                  quality.ornament && Math.abs(i - index) <= 1 ? 'full' : 'plain'
                }
              />
            </group>
          </group>
        );
      })}

      {/* the canvases themselves */}
      {artworks.map((a, i) => (
        <ArtworkPlane
          key={a.id}
          artwork={loaded.get(i) ?? null}
          position={[i * SPACING, HANG_Y, 0.09]}
          height={fitWork(a.shape === 'round' ? 1 : a.aspect, PLANE_H, MAX_W).height}
          aspect={a.aspect}
          shape={a.shape}
          active={i === index}
          onLeave={() => {
            if (i !== index) return;
            useStore.getState().setHoveredRegion(null);
            /*
             * Hover only ever opened the lens, so leaving only ever shuts it.
             * The full reveal is now a decision — a click — and a decision is
             * not undone by the cursor wandering off to read the label it
             * just asked for.
             */
            closeLens();
          }}
          onMove={(u, v) => {
            if (i !== index) return;
            const s = useStore.getState();
            const art = loaded.get(i);
            /*
             * HOVER LOOKS, CLICK DECIDES.
             *
             * Moving over the canvas opens the reading lens and nothing else:
             * a soft circle under the cursor where the glyphs give way and the
             * painting shows through, everywhere else still made of its own
             * words. The room does not slide, the wall label does not arrive,
             * and the picture does not dissolve out from under you — all of
             * that belongs to the click.
             *
             * Thread mode gets the same circle. It is the one thing on this
             * canvas that says "the cursor is here and the picture is under
             * the words", and a mode that took it away and drew a rectangle
             * instead read as a different, worse interface rather than as the
             * same one doing something else.
             */
            if (!art || !matchMedia('(pointer: fine)').matches) return;
            moveLens(u, v, art.glyphs.imageW, art.glyphs.imageH, LENS_RADIUS);

            if (s.extractionMode) {
              // and it keeps reporting what is under the cursor even while a
              // passage is out: thread mode is a mode you move around inside
              const region = regionAt(art.meta.regions ?? [], u, v);
              if (region?.id !== s.hoveredRegion?.id) s.setHoveredRegion(region);
            }
          }}
          onTap={(u, v) => {
            if (i !== index) return;
            const s = useStore.getState();
            // Thread Pull: Shift-click extracts the region under the cursor
            if (s.extractionMode) {
              const art = loaded.get(i);
              const region = art ? regionAt(art.meta.regions ?? [], u, v) : null;
              if (region) s.setPulledRegion(region);
              return;
            }
            // a click is a decision: open it and keep it open
            s.revealed && revealAnim.latched
              ? endReveal(reducedMotion)
              : startReveal(reducedMotion, true);
          }}
        />
      ))}

      {/* lighting: an accent-tinted fill, a picture light per bay, and the
          reveal spot */}
      <hemisphereLight ref={fillRef} args={['#FFF3E0', '#9C9080', 0.5]} />
      {artworks.map((_, i) => (
        <pointLight
          key={i}
          position={[i * SPACING, 4.8, 2.6]}
          color={museum.style.light.lamp}
          intensity={9}
          distance={11}
          decay={1.8}
        />
      ))}
      <spotLight
        ref={spotRef}
        angle={0.46}
        penumbra={0.85}
        distance={13}
        decay={1.4}
        color={museum.style.light.lamp}
        target={spotTarget.current}
        castShadow={quality.shadows}
      />
      <primitive object={spotTarget.current} />
    </group>
  );
}
