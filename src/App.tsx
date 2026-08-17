import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { selectArtworks, useStore } from './state/store';
import { attachPointer } from './state/motion';
import { detectTier, webgl2Supported } from './lib/deviceTier';
import { CorridorScene } from './scenes/CorridorScene';
import { GalleryScene } from './scenes/GalleryScene';
import { Environment } from './scenes/Lighting';
import { LandingLayer } from './ui/LandingLayer';
import { MapOverlay } from './ui/MapOverlay';
import { Placard } from './ui/Placard';
import { RailIndicator } from './ui/RailIndicator';
import { Credits } from './ui/Credits';
import { ThreadPull } from './ui/ThreadPull';
import { ControlHints } from './ui/ControlHints';
import { CursorRing } from './ui/CursorRing';
import { LoadingBar } from './ui/LoadingBar';
import { FlashLayer } from './ui/Flash';
import { endReveal } from './transitions/reveal';
import type { MuseumIndexEntry } from './types';

export default function App() {
  const phase = useStore((s) => s.phase);
  const revealed = useStore((s) => s.revealed);
  const museum = useStore((s) => s.museum);
  const setPhase = useStore((s) => s.setPhase);
  const setMuseums = useStore((s) => s.setMuseums);
  const artworks = useStore(selectArtworks);
  const [progress, setProgress] = useState(0);
  const [webgl] = useState(webgl2Supported);
  const tier = useMemo(detectTier, []);

  useEffect(() => attachPointer(), []);

  // BOOT: fetch the list of museums, then land. The chosen museum's own
  // manifest is fetched on selection, so entering one wing never costs the
  // download of the other four.
  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    (async () => {
      setProgress(0.25);
      try {
        const list = (await fetch('/museums/index.json').then((r) =>
          r.json(),
        )) as MuseumIndexEntry[];
        if (!alive) return;
        setMuseums(list);
      } catch {
        // assets missing (build:assets not run) — land anyway and say so
      }
      if (!alive) return;
      setProgress(1);
      setTimeout(() => alive && setPhase('landing'), 250);
    })();
    return () => {
      alive = false;
    };
  }, [webgl, setMuseums, setPhase]);

  // global Esc: exits reveal, gallery→map, map→corridor (spec §9)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useStore.getState();
      if (s.creditsOpen) return s.setCreditsOpen(false);
      if (s.pulledRegion) return s.setPulledRegion(null);
      if (s.phase === 'gallery' && s.revealed) return endReveal(s.reducedMotion);
      if (s.phase === 'gallery') return s.setPhase('map');
      if (s.phase === 'map') return s.setPhase('corridor');
      if (s.phase === 'corridor') return s.setPhase('landing');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!webgl) {
    return (
      <div className="webgl-missing">
        <p className="body">
          This exhibition needs WebGL2. Try a current version of Chrome, Firefox, Safari or
          Edge.
        </p>
      </div>
    );
  }

  const inCorridor =
    phase === 'landing' || phase === 'corridor' || phase === 'map' || phase === 'warp';
  const inGallery = phase === 'gallery';
  // background and fog start from the museum's own night tone; the gallery
  // then eases them toward the current painter's accent
  const bg = museum?.style.light.background ?? '#171412';
  const fog = museum?.style.light.fog ?? ['#2A2119', 38, 120];
  const exposure = museum?.style.light.exposure ?? 1.0;

  return (
    <>
      <div className={`canvas-wrap ${phase === 'map' ? 'is-blurred' : ''}`}>
        <Canvas
          dpr={[1, tier.dprCap]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          shadows={{ type: THREE.PCFSoftShadowMap }}
          camera={{ fov: 48, position: [0, 1.6, 4], near: 0.1, far: 160 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <ExposureRig exposure={exposure} />
          <color attach="background" args={[bg]} />
          {/* light haze for depth only — the far bays should still read */}
          <fog attach="fog" args={[fog[0], fog[1], fog[2]]} />
          <Suspense fallback={null}>
            <Environment intensity={inGallery ? 0.4 : 0.26} />
            {inCorridor && museum && artworks.length > 0 && <CorridorScene tier={tier} />}
            {inGallery && <GalleryScene tier={tier} />}
          </Suspense>
        </Canvas>
      </div>

      {/* reveal vignette — generous radius, 18% max (spec §10.6) */}
      <div className={`reveal-vignette ${revealed ? 'is-on' : ''}`} aria-hidden />

      {phase === 'boot' && <LoadingBar progress={progress} />}
      <LandingLayer />
      <MapOverlay />
      <Placard tier={tier} />
      <ThreadPull tier={tier} />
      <RailIndicator />
      {phase === 'corridor' && (
        <>
          <button className="caption gallery-back" onClick={() => setPhase('landing')}>
            ← Entrance
          </button>
          <p className="caption corridor-title">
            {museum?.name}
            <span className="corridor-sub"> · {museum?.subtitle}</span>
          </p>
        </>
      )}
      {inGallery && (
        <button className="caption gallery-back" onClick={() => setPhase('map')}>
          ← {museum?.name ?? 'Map'}
        </button>
      )}
      <ControlHints />
      <Credits />
      <FlashLayer />
      <CursorRing />

      {/* screen-reader / keyboard proxies for the canvas artworks (spec §15) */}
      {inGallery && <ArtworkProxies />}
    </>
  );
}

/**
 * Tone-mapping exposure follows the museum — the Met's court is a dusk room
 * and the Orsay nave is full of noon daylight, and one exposure cannot serve
 * both. Lives inside the Canvas so it can reach the renderer.
 */
function ExposureRig({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

function ArtworkProxies() {
  const artworks = useStore(selectArtworks);
  const index = useStore((s) => s.index);
  const setIndex = useStore((s) => s.setIndex);
  return (
    <div className="sr-proxies">
      {artworks.map((a, i) => (
        <button
          key={a.id}
          aria-label={`${a.artist}: ${a.title}. ${i === index ? 'Current artwork. Press Enter to reveal.' : 'Move to this artwork.'}`}
          onFocus={() => setIndex(i)}
          onClick={() => {
            const s = useStore.getState();
            if (i === index) {
              void import('./transitions/reveal').then((m) =>
                s.revealed ? m.endReveal(s.reducedMotion) : m.startReveal(s.reducedMotion),
              );
            }
          }}
        />
      ))}
    </div>
  );
}
