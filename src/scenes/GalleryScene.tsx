/**
 * GalleryScene — spec §10.4 / §10.6 / M6.
 *
 * Horizontal roll: artwork planes along +x, spacing 8, camera x = damped
 * scroll with magnetic snap. Exactly one plane renders live glyphs (the
 * nearest); reveal is hover on desktop / tap on touch, Esc or scroll exits.
 */
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../state/store';
import { gallery, pointer } from '../state/motion';
import { damp, dampK } from '../lib/damp';
import { GlyphPrePass } from '../glyph/GlyphPrePass';
import { loadArtwork, prefetchAround, type LoadedArtwork } from '../glyph/artworkLoader';
import { ArtworkPlane } from './ArtworkPlane';
import { startReveal, endReveal, revealAnim } from '../transitions/reveal';
import { LAMP } from './Lighting';
import type { DeviceTier } from '../types';

const SPACING = 8;
const CAM_Z = 3.4;
const PAL = {
  field: '#E8DFD0',
  highlight: '#F2EBDF',
  floorLight: '#E9E2D5',
  vault: '#EFE8DB',
};

/** screen-space projection of the active plane for the DOM placard (§10.7) */
export const placardAnchor = { x: 0, y: 0, edge: 0, visible: false };

export function GalleryScene({ tier }: { tier: DeviceTier }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const artworks = useStore((s) => s.artworks);
  const index = useStore((s) => s.index);
  const revealed = useStore((s) => s.revealed);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setIndex = useStore((s) => s.setIndex);

  const [loaded, setLoaded] = useState<Map<number, LoadedArtwork>>(new Map());
  const spotRef = useRef<THREE.SpotLight>(null);
  const spotTarget = useRef<THREE.Object3D>(new THREE.Object3D());
  const look = useRef({ x: 0, y: 0 });
  const touch = useRef({ x: 0, active: false });

  // load current + warm zone (spec §7.5)
  useEffect(() => {
    if (!artworks.length) return;
    const ids = artworks.map((a) => a.id);
    prefetchAround(ids, index, tier);
    let alive = true;
    for (const di of [0, 1, -1, 2]) {
      const i = index + di;
      if (i < 0 || i >= ids.length) continue;
      loadArtwork(ids[i], tier).then((art) => {
        if (!alive) return;
        setLoaded((m) => (m.has(i) ? m : new Map(m).set(i, art)));
      });
    }
    return () => {
      alive = false;
    };
  }, [artworks, index, tier]);

  // rail input: wheel / drag / arrows; scroll exits a reveal (spec §9)
  useEffect(() => {
    gallery.target = index * SPACING;
    gallery.x = index * SPACING;
    const wheelEnd = { t: 0 };
    const onWheel = (e: WheelEvent) => {
      const s = useStore.getState();
      if (s.revealed) endReveal(s.reducedMotion);
      gallery.target += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.01;
      gallery.target = Math.max(-1.5, Math.min((artworks.length - 1) * SPACING + 1.5, gallery.target));
      wheelEnd.t = performance.now();
      // magnetic snap after the wheel settles (spec §10.4)
      setTimeout(() => {
        if (performance.now() - wheelEnd.t < 140) return;
        const i = Math.round(gallery.target / SPACING);
        const clamped = Math.max(0, Math.min(artworks.length - 1, i));
        gsap.to(gallery, { target: clamped * SPACING, duration: 0.5, ease: 'power3.out' });
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
      gallery.target += dx * 0.02;
    };
    const onTouchEnd = () => {
      touch.current.active = false;
      const i = Math.max(0, Math.min(artworks.length - 1, Math.round(gallery.target / SPACING)));
      gsap.to(gallery, { target: i * SPACING, duration: 0.5, ease: 'power3.out' });
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
          target: next * SPACING,
          duration: s.reducedMotion ? 0.05 : 0.7,
          ease: 'expo.out',
        });
      }
      if (e.key === 'Enter' && !s.revealed) startReveal(s.reducedMotion);
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
        target: s.index * SPACING,
        duration: s.reducedMotion ? 0.05 : 0.7,
        ease: 'expo.out',
      });
    };
    return useStore.subscribe((s) => s.index, onJump);
  }, []);

  useFrame((state, delta) => {
    gallery.x = damp(gallery.x, gallery.target, 0.09, delta);

    // pointer parallax, damped (spec §10B)
    const k = dampK(0.06, delta);
    const px = reducedMotion ? 0 : pointer.x;
    const py = reducedMotion ? 0 : pointer.y;
    look.current.x += (px - look.current.x) * k;
    look.current.y += (py - look.current.y) * k;

    camera.position.set(gallery.x + look.current.x * 0.1, 1.6 + look.current.y * -0.04, CAM_Z);
    camera.rotation.set(
      -look.current.y * (1.2 * Math.PI) / 180,
      -look.current.x * (2.0 * Math.PI) / 180,
      0,
    );
    if (camera.fov !== 45) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }

    // spotlight follows + intensifies on reveal (spec §10.6)
    if (spotRef.current) {
      spotRef.current.position.set(index * SPACING, 4.6, 1.9);
      spotTarget.current.position.set(index * SPACING, 1.6, 0);
      spotTarget.current.updateMatrixWorld();
      spotRef.current.intensity = revealAnim.spot * 4;
    }
    state.scene.environmentIntensity = 0.45 * revealAnim.env;

    // project the active plane edge for the DOM placard (spec §10.7)
    const activeEntry = artworks[index];
    if (activeEntry) {
      const h = 2.4;
      const w = h * activeEntry.aspect;
      const v = new THREE.Vector3(index * SPACING + w / 2, 1.6, 0.1);
      v.project(camera);
      placardAnchor.x = (v.x * 0.5 + 0.5) * size.width;
      placardAnchor.y = (-v.y * 0.5 + 0.5) * size.height;
      placardAnchor.visible = true;
    }
  });

  const activeArt = loaded.get(index) ?? null;

  return (
    <group>
      <GlyphPrePass artwork={activeArt} rtSize={tier.rtSize} active />

      {/* wall */}
      <mesh position={[(artworks.length - 1) * SPACING * 0.5, 3.5, -0.12]}>
        <planeGeometry args={[artworks.length * SPACING + 30, 7]} />
        <meshStandardMaterial color={PAL.field} roughness={0.72} />
      </mesh>
      {/* dado + skirting */}
      <mesh position={[(artworks.length - 1) * SPACING * 0.5, 0.07, -0.09]}>
        <boxGeometry args={[artworks.length * SPACING + 30, 0.14, 0.06]} />
        <meshStandardMaterial color={PAL.highlight} roughness={0.7} />
      </mesh>
      {/* ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[(artworks.length - 1) * SPACING * 0.5, 7, 2]}>
        <planeGeometry args={[artworks.length * SPACING + 30, 14]} />
        <meshStandardMaterial color={PAL.vault} roughness={0.85} />
      </mesh>
      {/* reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(artworks.length - 1) * SPACING * 0.5, 0, 2]}>
        <planeGeometry args={[artworks.length * SPACING + 30, 14]} />
        <MeshReflectorMaterial
          resolution={tier.name === 'high' ? 1024 : 512}
          blur={[400, 100]}
          mixBlur={0.75}
          mixStrength={0.5}
          roughness={0.18}
          depthScale={0.6}
          minDepthThreshold={0.4}
          color={PAL.floorLight}
          metalness={0.12}
          mirror={0.45}
        />
      </mesh>
      {/* opposite wall, far behind the camera (true-3D parallax layer, §10B.3) */}
      <mesh position={[(artworks.length - 1) * SPACING * 0.5, 3.5, 10.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[artworks.length * SPACING + 30, 7]} />
        <meshStandardMaterial color={PAL.field} roughness={0.72} />
      </mesh>

      {/* planes */}
      {artworks.map((a, i) => (
        <ArtworkPlane
          key={a.id}
          artwork={loaded.get(i) ?? null}
          position={[i * SPACING, 1.6, 0]}
          aspect={a.aspect}
          active={i === index}
          onEnter={() => {
            if (i !== index) return;
            if (matchMedia('(pointer: fine)').matches) startReveal(reducedMotion);
          }}
          onLeave={() => {
            if (i !== index) return;
            if (matchMedia('(pointer: fine)').matches) endReveal(reducedMotion);
          }}
          onTap={() => {
            if (i !== index) return;
            if (matchMedia('(pointer: fine)').matches) return;
            const s = useStore.getState();
            s.revealed ? endReveal(reducedMotion) : startReveal(reducedMotion);
          }}
        />
      ))}

      {/* lighting */}
      <hemisphereLight args={['#FFF3E0', '#C9BCA6', 0.55]} />
      {artworks.map((_, i) => (
        <pointLight
          key={i}
          position={[i * SPACING, 5.6, 2.4]}
          color={LAMP}
          intensity={10}
          distance={11}
          decay={1.8}
        />
      ))}
      <spotLight
        ref={spotRef}
        angle={0.42}
        penumbra={0.85}
        distance={12}
        decay={1.4}
        color={LAMP}
        target={spotTarget.current}
      />
      <primitive object={spotTarget.current} />
    </group>
  );
}
