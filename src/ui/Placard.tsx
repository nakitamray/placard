/**
 * Placard — spec §10.7 / §10C.5.
 *
 * DOM element positioned by projecting the plane's world position; two tiers
 * (wall label shown immediately, extended note on expand). Provenance gets
 * two treatments: housing prominent and plain; text origin in small italics
 * where a real credit line sits.
 *
 * The card stays up once a work is revealed. It used to be tied to the
 * cursor being over the canvas, which meant reading it required holding the
 * mouse somewhere other than where you were reading — and scrolling to reach
 * the end of the note dismissed it outright. It now behaves like a wall
 * label: it appears when you look at the work, it stays while you read it,
 * and it goes when you say so.
 */
import { useEffect, useRef, useState } from 'react';
import { selectArtworks, useStore } from '../state/store';
import { placardAnchor } from '../scenes/GalleryScene';
import { loadMeta } from '../glyph/artworkLoader';
import { endReveal, latchReveal } from '../transitions/reveal';
import type { ArtworkMeta } from '../types';

export function Placard() {
  const phase = useStore((s) => s.phase);
  const index = useStore((s) => s.index);
  const revealed = useStore((s) => s.revealed);
  const expanded = useStore((s) => s.placardExpanded);
  const setExpanded = useStore((s) => s.setPlacardExpanded);
  const artworks = useStore(selectArtworks);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const [meta, setMeta] = useState<ArtworkMeta | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const entry = artworks[index];
    if (!entry) return;
    let alive = true;
    // only meta.json — the glyph field this work will need is loaded by the
    // gallery, when and if you actually walk into the room
    loadMeta(entry.id).then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, [artworks, index]);

  // track the projected plane edge (spec §10.7: offset 40px right of frame,
  // clamped 24px from the viewport edge)
  useEffect(() => {
    if (phase !== 'gallery' || !revealed) return;
    let raf = 0;
    const tick = () => {
      const el = cardRef.current;
      if (el && placardAnchor.visible) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const coarse = matchMedia('(pointer: coarse)').matches;
        if (!coarse) {
          /*
           * Pinned to the right margin, not to the frame.
           *
           * Following the painting's edge was fine when the canvas was small,
           * but it now fills most of the screen, so "just right of the frame"
           * is on top of the picture. The gallery slides left while the label
           * is open (see GalleryScene) and the label holds the right-hand
           * column, which also means it stops jumping about as you move
           * between works of different widths.
           */
          const x = Math.max(24, window.innerWidth - w - 24);
          const y = Math.max(24, Math.min(placardAnchor.y - h / 2, window.innerHeight - h - 24));
          el.style.transform = `translate(${x}px, ${y}px)`;
        } else {
          el.style.transform = '';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, revealed]);

  if (phase !== 'gallery' || !meta) return null;

  const visible = revealed;

  return (
    <aside
      ref={cardRef}
      className={`placard ${visible ? 'is-visible' : ''} ${expanded ? 'is-expanded' : ''}`}
      aria-hidden={!visible}
      // reaching the label is itself the decision to read it: the reveal stops
      // being a hover state the moment the cursor lands here
      onPointerEnter={latchReveal}
    >
      <button
        className="placard-close"
        onClick={() => endReveal(reducedMotion)}
        aria-label="Close the wall label"
        title="Close (Esc)"
      >
        ✕
      </button>
      <div className="placard-scroll" ref={scrollRef}>
        <p className="meta placard-artist">{meta.artist.toUpperCase()}</p>
        <p className="caption placard-dates">{meta.artistDates}</p>

        <h3 className="title placard-title">{meta.title}</h3>
        <p className="caption">{meta.year}</p>

        <p className="meta placard-medium">
          {meta.medium}
          <br />
          {meta.dimensions}
        </p>

        <hr className="hairline" />

        {/* housing — prominent, plain, no italics: the load-bearing fact */}
        <p className="body placard-housing">
          {meta.housedAt.institution}, {meta.housedAt.city}
        </p>
        <p className="caption placard-room">
          {meta.housedAt.room} · {meta.housedAt.accession}
        </p>

        <hr className="hairline" />

        <p className="body placard-label">{meta.labelText}</p>

        <button
          className="caption placard-more"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Read less' : 'Read more'} <span className="chev">⌄</span>
        </button>

        <div className="placard-note" hidden={!expanded}>
          {meta.extendedNote.split('\n\n').map((p, i) => (
            <p key={i} className="body">
              {p}
            </p>
          ))}
        </div>

        {/* text origin — small italics where a real credit line sits */}
        <p className="caption placard-provenance">{meta.textProvenance.attribution}</p>
      </div>
    </aside>
  );
}
