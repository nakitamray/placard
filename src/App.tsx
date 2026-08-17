import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from './state/store';
import { attachPointer } from './state/motion';
import { detectTier, webgl2Supported } from './lib/deviceTier';
import { CorridorScene } from './scenes/CorridorScene';
import { GalleryScene } from './scenes/GalleryScene';
import { Environment, HemisphereFill } from './scenes/Lighting';
import { LandingLayer } from './ui/LandingLayer';
import { MapOverlay } from './ui/MapOverlay';
import { Placard } from './ui/Placard';
import { RailIndicator } from './ui/RailIndicator';
import { Credits } from './ui/Credits';
import { ThreadPull } from './ui/ThreadPull';
import { CorridorHints } from './ui/CorridorHints';
import { CursorRing } from './ui/CursorRing';
import { LoadingBar } from './ui/LoadingBar';
import { FlashLayer } from './ui/Flash';
import { endReveal } from './transitions/reveal';
import type { ArtworkIndexEntry, GalleryData } from './types';

export default function App() {
  const phase = useStore((s) => s.phase);
  const revealed = useStore((s) => s.revealed);
  const setPhase = useStore((s) => s.setPhase);
  const setData = useStore((s) => s.setData);
  const artworks = useStore((s) => s.artworks);
  const [progress, setProgress] = useState(0);
  const [webgl] = useState(webgl2Supported);
  const tier = useMemo(detectTier, []);

  useEffect(() => attachPointer(), []);

  // BOOT: fetch the index + gallery data, then land
  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    (async () => {
      setProgress(0.2);
      try {
        const [index, gallery] = await Promise.all([
          fetch('/artworks/index.json').then((r) => r.json() as Promise<ArtworkIndexEntry[]>),
          fetch('/galleries/orsay.json').then((r) => r.json() as Promise<GalleryData>),
        ]);
        if (!alive) return;
        setProgress(0.7);
        setData(index, gallery);
      } catch {
        // assets missing (build:assets not run) — land anyway with empty data
      }
      if (!alive) return;
      setProgress(1);
      setTimeout(() => alive && setPhase('landing'), 250);
    })();
    return () => {
      alive = false;
    };
  }, [webgl, setData, setPhase]);

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

  const inCorridor = phase === 'landing' || phase === 'corridor' || phase === 'map' || phase === 'warp';
  const inGallery = phase === 'gallery';

  return (
    <>
      <div className={`canvas-wrap ${phase === 'map' ? 'is-blurred' : ''}`}>
        <Canvas
          dpr={[1, tier.dprCap]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          shadows={{ type: THREE.PCFSoftShadowMap }}
          camera={{ fov: 48, position: [0, 1.6, 4], near: 0.1, far: 120 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            // pulled down from the spec's 1.15: the corridor is now lit by
            // raking sun rather than flat fill, so highlights carry the scene
            gl.toneMappingExposure = 0.95;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <color attach="background" args={['#171412']} />
          {/* light haze for depth only — the far bays should still read */}
          <fog attach="fog" args={['#2A2119', 38, 120]} />
          <Suspense fallback={null}>
            <Environment intensity={inGallery ? 0.4 : 0.24} />
            <HemisphereFill intensity={inGallery ? 0.34 : 0.12} />
            {inCorridor && artworks.length > 0 && <CorridorScene />}
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
          <CorridorHints />
        </>
      )}
      {inGallery && (
        <button className="caption gallery-back" onClick={() => setPhase('map')}>
          ← Map
        </button>
      )}
      <Credits />
      <FlashLayer />
      <CursorRing />

      {/* screen-reader / keyboard proxies for the canvas artworks (spec §15) */}
      {inGallery && <ArtworkProxies />}
    </>
  );
}

function ArtworkProxies() {
  const artworks = useStore((s) => s.artworks);
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
