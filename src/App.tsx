import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { selectArtworks, useStore } from './state/store';
import { attachPointer, pointer } from './state/motion';
import { detectTier, webgl2Supported } from './lib/deviceTier';
import {
  initialQuality,
  qualityFor,
  stepDown,
  storeQuality,
  storedQuality,
  type QualityName,
} from './lib/quality';
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
import { asset } from './lib/asset';
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
  const [qualityName, setQualityName] = useState<QualityName>(() => initialQuality(tier).name);
  const quality = useMemo(() => qualityFor(qualityName), [qualityName]);

  const chooseQuality = (name: QualityName) => {
    storeQuality(name);
    setQualityName(name);
  };

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
        const list = (await fetch(asset('museums/index.json')).then((r) =>
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
          dpr={[1, quality.dprCap]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
          camera={{ fov: 48, position: [0, 1.6, 4], near: 0.1, far: 160 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <ExposureRig exposure={exposure} />
          <FrameWatchdog quality={qualityName} onStruggling={setQualityName} />
          <color attach="background" args={[bg]} />
          {/* light haze for depth only — the far bays should still read */}
          <fog attach="fog" args={[fog[0], fog[1], fog[2]]} />
          <Suspense fallback={null}>
            <Environment intensity={inGallery ? 0.4 : 0.26} />
            {inCorridor && museum && artworks.length > 0 && <CorridorScene quality={quality} />}
            {inGallery && <GalleryScene tier={tier} quality={quality} />}
          </Suspense>
        </Canvas>
      </div>

      {/* reveal vignette — generous radius, 18% max (spec §10.6) */}
      <div className={`reveal-vignette ${revealed ? 'is-on' : ''}`} aria-hidden />

      {phase === 'boot' && <LoadingBar progress={progress} />}
      <LandingLayer />
      <MapOverlay />
      <Placard />
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
          <WorkLabel />
        </>
      )}
      {inGallery && (
        <button className="caption gallery-back" onClick={() => setPhase('map')}>
          ← {museum?.name ?? 'Map'}
        </button>
      )}
      <ControlHints />
      {(phase === 'corridor' || inGallery) && (
        <QualityToggle value={qualityName} onChange={chooseQuality} />
      )}
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

/**
 * Drops the budget a step if the room is genuinely not keeping up.
 *
 * Detection guesses from hardware; this measures. It samples frame times over
 * a few seconds of real rendering and steps down once if the median is below
 * roughly 24fps, which is where panning starts to feel like it is dragging.
 *
 * Two things it deliberately does not do: it never steps *up*, because
 * oscillating between budgets is worse than sitting on the lower one; and it
 * never overrides a visitor who has picked a level, because being second-
 * guessed by the page is more annoying than a slow frame.
 */
function FrameWatchdog({
  quality,
  onStruggling,
}: {
  quality: QualityName;
  onStruggling: (q: QualityName) => void;
}) {
  const samples = useRef<number[]>([]);
  const done = useRef(false);
  const last = useRef(0);

  useFrame(() => {
    if (done.current || storedQuality()) return;
    const now = performance.now();
    if (last.current) {
      const dt = now - last.current;
      // ignore the first frames after a scene swap, which are always slow
      if (dt < 500) samples.current.push(dt);
    }
    last.current = now;

    if (samples.current.length < 180) return;
    done.current = true;
    const sorted = [...samples.current].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    if (median > 1000 / 24) {
      const next = stepDown(quality);
      if (next) onStruggling(next);
    }
  });
  return null;
}

/**
 * The visitor's own control over how much the room costs to draw.
 *
 * Auto-detection gets the tier roughly right and is wrong often enough to
 * matter — an old machine with a good GPU, a new one throttled on battery —
 * so the choice is theirs, three plain words, remembered per browser.
 */
function QualityToggle({
  value,
  onChange,
}: {
  value: QualityName;
  onChange: (q: QualityName) => void;
}) {
  const options: Array<[QualityName, string]> = [
    ['low', 'Smooth'],
    ['mid', 'Balanced'],
    ['high', 'Rich'],
  ];
  return (
    <div className="quality-toggle caption" role="group" aria-label="Rendering quality">
      {options.map(([name, label]) => (
        <button
          key={name}
          className={value === name ? 'is-on' : ''}
          aria-pressed={value === name}
          onClick={() => onChange(name)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The wall label that appears when the cursor is over a canvas in the
 * corridor. It follows the pointer rather than the painting, so it never
 * covers the work it is naming, and it says what clicking will do.
 */
function WorkLabel() {
  const work = useStore((s) => s.hoveredWork);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!work) return;
    let raf = 0;
    const cur = { x: 0, y: 0 };
    let first = true;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const tx = pointer.x * (window.innerWidth / 2) + window.innerWidth / 2 + 22;
        const ty = pointer.y * (window.innerHeight / 2) + window.innerHeight / 2 + 20;
        if (first) {
          cur.x = tx;
          cur.y = ty;
          first = false;
        } else {
          cur.x += (tx - cur.x) * 0.24;
          cur.y += (ty - cur.y) * 0.24;
        }
        const w = el.offsetWidth;
        const x = Math.min(cur.x, window.innerWidth - w - 20);
        el.style.transform = `translate(${x}px, ${cur.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [work]);

  if (!work) return null;
  return (
    <div className="work-label" ref={ref} aria-hidden>
      <p className="work-label-artist caption">{work.artist}</p>
      <p className="work-label-title">{work.title}</p>
      <p className="work-label-cue caption">Click to enter this room</p>
    </div>
  );
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
