/**
 * Thread Pull — pull a thread of text out of the painting and read it.
 *
 * Hold Shift over the canvas and the cursor enters extraction mode. Hovering
 * a semantic region (the sky, the profile, the clown in the foreground) lifts
 * that region's glyphs off the artwork: they stop drifting, fade out of the
 * WebGL layer, and the same characters fly in screen space into a reading
 * panel, where they assemble into legible left-to-right prose. Releasing
 * Shift flies them home. Clicking pins the panel so a long passage can be
 * read at leisure.
 *
 * HOW THE SEAM IS HIDDEN
 *   The flying characters are DOM spans set in the *same monospace* as the
 *   canvas glyphs, at the same tracking. They launch from the exact viewport
 *   coordinates of their home cells (projected live from the 3D camera, so a
 *   resize mid-flight just yields new coordinates) and land in their final
 *   flowed positions. Only once they have landed does the block cross-fade
 *   from monospace to the reading serif — the settle, not the flight, is
 *   where the typeface changes.
 *
 * PERFORMANCE
 *   Only the first FLIGHT_CHARS characters animate individually; the tail of
 *   a long passage fades in as a block once they land. Every animated
 *   property is a transform or opacity, driven by one interruptible GSAP
 *   timeline, so hundreds of glyphs cost one compositor pass rather than
 *   layout work.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { selectArtworks, useStore } from '../state/store';
import { artworkProjector, threadPullAnim } from '../threadpull/state';
import { loadArtwork } from '../glyph/artworkLoader';
import { sfx } from '../lib/audio';
import { discoverFromText } from '../state/atlas';
import type { ArtworkRegion, DeviceTier } from '../types';

/** characters that fly individually; the rest of the passage fades in */
const FLIGHT_CHARS = 320;

/** the one unprompted demonstration: when it starts, and how long it holds */
const DEMO_KEY = 'placard.seenThread';
const DEMO_DELAY_MS = 2200;
const DEMO_HOLD_MS = 5200;

export function ThreadPull({ tier }: { tier: DeviceTier }) {
  const phase = useStore((s) => s.phase);
  const artworks = useStore(selectArtworks);
  const index = useStore((s) => s.index);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const extractionMode = useStore((s) => s.extractionMode);
  const hoveredRegion = useStore((s) => s.hoveredRegion);
  const pulledRegion = useStore((s) => s.pulledRegion);
  const setExtractionMode = useStore((s) => s.setExtractionMode);
  const setPulledRegion = useStore((s) => s.setPulledRegion);

  const [pinned, setPinned] = useState(false);
  /** true while the one unprompted demonstration is on screen */
  const [demo, setDemo] = useState(false);
  /** the region still on screen while its text flies home */
  const [leaving, setLeaving] = useState<ArtworkRegion | null>(null);

  const flightRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const outlineRef = useRef<SVGRectElement>(null);

  const inGallery = phase === 'gallery';
  const region = pulledRegion ?? leaving;

  /*
   * Space turns thread mode on, and leaves it on.
   *
   * It used to be Shift, held down for as long as you wanted to read — which
   * meant holding a key with one hand and steering with the other for as long
   * as the passage took, and losing the passage the moment you let go to
   * scroll or to think. It is a mode, so it is now a switch: press Space and
   * the canvas becomes a map of its own passages, hover them to read, press
   * Space (or Esc) to have the painting back.
   */
  useEffect(() => {
    if (!inGallery) {
      setExtractionMode(false);
      return;
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      // the browser's own use for Space is scrolling, which this page does not do
      e.preventDefault();
      if (e.repeat) return;
      const on = !useStore.getState().extractionMode;
      setExtractionMode(on);
      if (!on) {
        setPinned(false);
        setPulledRegion(null);
      }
    };
    const onBlur = () => {
      setExtractionMode(false);
      setPinned(false);
      setPulledRegion(null);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [inGallery, setExtractionMode, setPulledRegion]);

  // leaving thread mode by any route puts the passage back
  useEffect(() => {
    if (extractionMode) return;
    setPinned(false);
    setPulledRegion(null);
  }, [extractionMode, setPulledRegion]);

  /*
   * A pulled thread is read for the connections it gives away. This is the
   * only way the atlas grows, so it runs on every extraction — the visitor's
   * own and the one demonstration alike.
   */
  useEffect(() => {
    if (!pulledRegion) return;
    const art = artworks[index];
    if (!art) return;
    if (discoverFromText(art.id, pulledRegion.text)) sfx.link();
  }, [pulledRegion, artworks, index]);

  // In thread mode, moving over a passage pulls it — no second gesture, and
  // moving to another passage swaps to it without leaving the mode first.
  useEffect(() => {
    if (!extractionMode || pinned) return;
    if (hoveredRegion && hoveredRegion.id !== pulledRegion?.id) setPulledRegion(hoveredRegion);
  }, [extractionMode, hoveredRegion, pulledRegion, pinned, setPulledRegion]);

  // leaving the gallery, or the artwork changing, cancels any extraction
  useEffect(() => {
    setPulledRegion(null);
    setPinned(false);
  }, [index, phase, setPulledRegion]);

  /*
   * Show the trick once, unasked.
   *
   * Thread Pull is the most distinctive thing in this exhibition and it is
   * behind a held modifier key on a target you cannot see, which means almost
   * nobody finds it. No hint line fixes that — a sentence about holding Shift
   * is a sentence, and watching a paragraph lift itself off a painting and
   * assemble into prose is the thing itself. So the first room anyone enters
   * pulls one thread on its own, holds it long enough to be read as an event
   * rather than a glitch, and puts it back.
   *
   * Once per session, never under reduced motion, and cancelled the instant
   * the visitor does anything — being demonstrated to while you are already
   * doing it yourself is worse than not being shown at all.
   */
  useEffect(() => {
    if (!inGallery || reducedMotion) return;
    if (sessionStorage.getItem(DEMO_KEY) === '1') return;
    const art = artworks[index];
    if (!art) return;

    let cancelled = false;
    const timers: number[] = [];
    const stop = () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
    window.addEventListener('keydown', stop, { once: true });
    window.addEventListener('pointerdown', stop, { once: true });

    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        void loadArtwork(art.id, tier).then((a) => {
          const region = a.meta.regions?.[0];
          if (cancelled || !region) return;
          sessionStorage.setItem(DEMO_KEY, '1');
          setDemo(true);
          setPulledRegion(region);
          sfx.rustle();
          timers.push(
            window.setTimeout(() => {
              setPulledRegion(null);
              setDemo(false);
            }, DEMO_HOLD_MS),
          );
        });
      }, DEMO_DELAY_MS),
    );

    return () => {
      stop();
      window.removeEventListener('keydown', stop);
      window.removeEventListener('pointerdown', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGallery, index, reducedMotion, tier]);

  // extraction-mode cursor
  useEffect(() => {
    document.documentElement.classList.toggle('is-extracting', extractionMode && inGallery);
    return () => document.documentElement.classList.remove('is-extracting');
  }, [extractionMode, inGallery]);

  // keep the outgoing region mounted while its text flies home
  const lastRegion = useRef<ArtworkRegion | null>(null);
  useEffect(() => {
    if (pulledRegion) {
      lastRegion.current = pulledRegion;
      setLeaving(null);
    } else if (lastRegion.current) {
      setLeaving(lastRegion.current);
    }
  }, [pulledRegion]);

  /** home viewport coordinates for character i of n, spread across the box */
  const homeFor = (r: ArtworkRegion, i: number, n: number) => {
    const project = artworkProjector.project;
    if (!project) return null;
    const [x0, y0, x1, y1] = r.box;
    const w = x1 - x0;
    const h = y1 - y0;
    // row-major, mirroring the corpus reading order the glyph builder uses
    const cols = Math.max(1, Math.round(Math.sqrt((n * w) / Math.max(h, 0.001))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    return project(x0 + ((cx + 0.5) / cols) * w, y0 + ((cy + 0.5) / rows) * h);
  };

  // --- the flight ---
  useLayoutEffect(() => {
    const host = flightRef.current;
    if (!host || !pulledRegion) return;

    const spans = Array.from(host.querySelectorAll<HTMLSpanElement>('span[data-i]'));
    if (!spans.length) return;

    tlRef.current?.kill();
    gsap.set(spans, { clearProps: 'transform,opacity' });

    // freeze the canvas glyphs of this region and fade them out
    const art = artworks[index] ? loadArtwork(artworks[index].id, tier) : null;
    void art?.then((a) => {
      const [x0, y0, x1, y1] = pulledRegion.box;
      threadPullAnim.box = [
        x0 * a.glyphs.imageW,
        y0 * a.glyphs.imageH,
        x1 * a.glyphs.imageW,
        y1 * a.glyphs.imageH,
      ];
      threadPullAnim.frozenOffset =
        ((window as unknown as { __prepass?: { charOffset: number } }).__prepass?.charOffset ?? 0);
    });

    if (reducedMotion) {
      threadPullAnim.detach = 1;
      gsap.set(host, { opacity: 0 });
      gsap.set(panelRef.current, { opacity: 1 });
      return;
    }

    const tl = gsap.timeline();
    tlRef.current = tl;
    tl.to(threadPullAnim, { detach: 1, duration: 0.5, ease: 'power2.out' }, 0);

    // each span flies from where its character sits on the canvas
    spans.forEach((span, i) => {
      const home = homeFor(pulledRegion, i, spans.length);
      const rect = span.getBoundingClientRect();
      if (!home) return;
      tl.fromTo(
        span,
        {
          x: home.x - rect.left,
          y: home.y - rect.top,
          opacity: 0.15,
          scale: 0.7,
        },
        {
          x: 0,
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.85,
          ease: 'power3.out',
        },
        0.02 + i * 0.0016,
      );
    });

    // once assembled, settle from the canvas monospace into reading serif
    tl.to(host, { opacity: 0, duration: 0.26, ease: 'power2.inOut' }, '>-0.05');
    tl.fromTo(
      panelRef.current!.querySelector('.tp-settled'),
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' },
      '<',
    );

    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulledRegion, reducedMotion, index]);

  // --- the return flight ---
  useEffect(() => {
    if (pulledRegion || !leaving) return;
    const host = flightRef.current;
    tlRef.current?.kill();
    if (!host) {
      threadPullAnim.detach = 0;
      lastRegion.current = null;
      setLeaving(null);
      return;
    }
    if (reducedMotion) {
      threadPullAnim.detach = 0;
      lastRegion.current = null;
      setLeaving(null);
      return;
    }
    const spans = Array.from(host.querySelectorAll<HTMLSpanElement>('span[data-i]'));
    const back = gsap.timeline({
      onComplete: () => {
        lastRegion.current = null;
        setLeaving(null);
      },
    });
    tlRef.current = back;
    const settled = panelRef.current?.querySelector('.tp-settled');
    if (settled) back.to(settled, { opacity: 0, duration: 0.18 }, 0);
    back.to(host, { opacity: 1, duration: 0.18 }, 0);
    spans.forEach((span, i) => {
      // recomputed now, so a resize while extracted still returns home
      const home = leaving ? homeFor(leaving, i, spans.length) : null;
      const rect = span.getBoundingClientRect();
      if (!home) return;
      back.to(
        span,
        {
          x: home.x - rect.left,
          y: home.y - rect.top,
          opacity: 0,
          scale: 0.7,
          duration: 0.6,
          ease: 'power2.in',
        },
        0.1 + i * 0.0008,
      );
    });
    back.to(threadPullAnim, { detach: 0, duration: 0.5, ease: 'power2.in' }, 0.35);
    return () => {
      back.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulledRegion, leaving, reducedMotion]);

  // region outline while hunting in extraction mode
  useEffect(() => {
    if (!extractionMode || !inGallery) return;
    let raf = 0;
    const tick = () => {
      const el = outlineRef.current;
      const r = hoveredRegion;
      const project = artworkProjector.project;
      if (el && r && project) {
        const a = project(r.box[0], r.box[1]);
        const b = project(r.box[2], r.box[3]);
        if (a && b) {
          el.setAttribute('x', String(Math.min(a.x, b.x)));
          el.setAttribute('y', String(Math.min(a.y, b.y)));
          el.setAttribute('width', String(Math.abs(b.x - a.x)));
          el.setAttribute('height', String(Math.abs(b.y - a.y)));
          el.style.opacity = '1';
        }
      } else if (el) {
        el.style.opacity = '0';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [extractionMode, inGallery, hoveredRegion]);

  if (!inGallery) return null;

  const flightText = region ? region.text.slice(0, FLIGHT_CHARS) : '';
  const tailText = region ? region.text.slice(FLIGHT_CHARS) : '';

  return (
    <>
      {/* extraction-mode affordance over the canvas */}
      {extractionMode && !pulledRegion && (
        <svg className="tp-outline" aria-hidden>
          <rect ref={outlineRef} rx="1" />
        </svg>
      )}
      {extractionMode && !pulledRegion && (
        <p className="tp-prompt caption">
          {hoveredRegion ? hoveredRegion.label : 'Move over the painting to pull a thread'}
        </p>
      )}

      {region && (
        <aside
          ref={panelRef}
          className={`tp-panel ${pulledRegion ? 'is-open' : 'is-closing'}`}
          role="dialog"
          aria-label={`Extracted text: ${region.label}`}
        >
          <header className="tp-head">
            <p className="caption tp-eyebrow">Thread pulled</p>
            <h3 className="title tp-title">{region.label}</h3>
            <button
              className="caption tp-close"
              onClick={() => {
                setPinned(false);
                setPulledRegion(null);
              }}
            >
              Close ✕
            </button>
          </header>

          <div className="tp-body">
            {/* in flight: the canvas's own monospace, character by character */}
            <p className="tp-flight" ref={flightRef} aria-hidden>
              {flightText.split('').map((c, i) => (
                <span key={i} data-i={i}>
                  {c === ' ' ? ' ' : c}
                </span>
              ))}
            </p>
            {/* landed: the same words, set for reading */}
            <div className="tp-settled">
              <p className="body">{region.text}</p>
            </div>
            {tailText && <span className="sr-only">{tailText}</span>}
          </div>

          <footer className="tp-foot">
            {demo ? (
              <span className="caption tp-hint tp-demo">
                Press <kbd>space</kbd>, then move over the painting to pull your own
              </span>
            ) : pinned ? (
              <span className="caption tp-hint">Pinned · Esc to release</span>
            ) : (
              <button className="caption tp-pin" onClick={() => setPinned(true)}>
                Pin this thread
              </button>
            )}
          </footer>
        </aside>
      )}
    </>
  );
}
