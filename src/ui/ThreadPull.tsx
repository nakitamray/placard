/**
 * Thread Pull — pull a thread of text out of the painting and read it.
 *
 * Press space (or use the Threads toggle) and the canvas becomes a map of its
 * own passages. Hovering a semantic region — the sky, the profile, the clown
 * in the foreground — lifts that region's glyphs off the artwork: they stop
 * drifting, fade out of the WebGL layer, and the same characters fly in screen
 * space into a reading panel, where they assemble into legible left-to-right
 * prose. Leaving the mode flies them home. Pinning holds a long passage still
 * so it can be read at leisure.
 *
 * The mode says so. A gilt pill sits low on the screen for exactly as long as
 * thread mode is on, because a mode you cannot see is a mode you cannot tell
 * from a bug.
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
import { artworkProjector, setThreadMode, threadPullAnim, toggleThreadMode } from '../threadpull/state';
import { loadArtwork } from '../glyph/artworkLoader';
import { sfx } from '../lib/audio';
import { discoverFromText } from '../state/atlas';
import type { ArtworkRegion, DeviceTier } from '../types';

/**
 * Characters that fly individually; the rest of the passage fades in.
 *
 * Every one of these is a positioned DOM node tweened from its own cell on
 * the canvas, so this number is the cost of the effect. A hundred and twenty
 * is still a paragraph lifting off a painting and is a third of the work.
 */
const FLIGHT_CHARS = 120;

/** how long the pointer rests on a passage before it is pulled */
const SETTLE_MS = 240;

export function ThreadPull({ tier }: { tier: DeviceTier }) {
  const phase = useStore((s) => s.phase);
  const artworks = useStore(selectArtworks);
  const index = useStore((s) => s.index);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const extractionMode = useStore((s) => s.extractionMode);
  const hoveredRegion = useStore((s) => s.hoveredRegion);
  const pulledRegion = useStore((s) => s.pulledRegion);
  const setPulledRegion = useStore((s) => s.setPulledRegion);

  const [pinned, setPinned] = useState(false);
  /** the region still on screen while its text flies home */
  const [leaving, setLeaving] = useState<ArtworkRegion | null>(null);

  const flightRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const inGallery = phase === 'gallery';
  const region = pulledRegion ?? leaving;

  /*
   * Space turns thread mode on, and leaves it on.
   *
   * Reading a passage takes both hands and a minute, so a held modifier is the
   * wrong control: it costs a hand for the whole time and drops the passage
   * the moment you let go to scroll or to think. This is a mode, so it gets a
   * switch — press Space and the canvas becomes a map of its own passages,
   * hover them to read, press Space (or Esc) to have the painting back.
   */
  useEffect(() => {
    if (!inGallery) {
      setThreadMode(false);
      return;
    }
    /*
     * Listens in the capture phase, and blurs the focused control first.
     *
     * Space is also how a browser activates the focused button. Anyone who had
     * clicked the sound toggle, a quality word or the atlas link — which is
     * most people, since those are the only clickable things in the room —
     * was pressing Space at a focused <button>, and the keystroke went to that
     * button instead of here. That is the whole of "sometimes it works and
     * sometimes it doesn't": it worked when the last click had landed on the
     * canvas and not when it had landed on a control.
     *
     * So: capture, so this runs before anything else can claim the key;
     * preventDefault, so the browser's own activation never happens; and blur
     * the offending control, so the NEXT press is not fighting it either.
     */
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const el = e.target as HTMLElement | null;
      // typing in the contact form, or anywhere else text is being entered,
      // is not a request for thread mode
      if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      // nor is scrolling the colophon or turning the atlas: the room is behind
      // an overlay and the key belongs to whatever is on top of it
      if (useStore.getState().creditsOpen || document.querySelector('.atlas')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (el && el !== document.body && typeof el.blur === 'function') el.blur();
      toggleThreadMode();
    };
    const onBlur = () => setThreadMode(false);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [inGallery]);

  // leaving thread mode by any route puts the passage back
  useEffect(() => {
    if (extractionMode) return;
    setPinned(false);
    setPulledRegion(null);
  }, [extractionMode, setPulledRegion]);

  /*
   * A pulled thread is read for the connections it gives away. This is the
   * only way the atlas grows, so it runs on every extraction.
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

  if (!inGallery) return null;

  const flightText = region ? region.text.slice(0, FLIGHT_CHARS) : '';
  const tailText = region ? region.text.slice(FLIGHT_CHARS) : '';

  return (
    <>
      {/* The affordance over the canvas is the same reading lens as anywhere
          else — a soft circle under the cursor. A rectangle snapped round the
          region turns a painting into a diagram of its own boxes, and the
          boxes are an authoring detail nobody came to see. */}
      {extractionMode && !pulledRegion && (
        <p className="tp-prompt caption">
          {hoveredRegion ? hoveredRegion.label : 'Move over the painting to pull a thread'}
        </p>
      )}

      {/* the standing notice: thread mode is on, and here is the way out */}
      {extractionMode && (
        <button
          className="tp-mode caption"
          onClick={() => setThreadMode(false)}
          title="Leave thread mode (space)"
        >
          <span className="tp-mode-dot" aria-hidden />
          Thread mode on
          <span className="tp-mode-key">
            <kbd>space</kbd> to leave
          </span>
        </button>
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
            {pinned ? (
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
