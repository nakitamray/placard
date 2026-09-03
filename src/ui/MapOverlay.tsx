/**
 * Map overlay — spec §10.3 / §10C.4.
 *
 * The wing's index: one line per painting, in the order they hang. It was a
 * drawn floor plan — a grid of boxes with a room name in each — and it read
 * as an unfinished table rather than as a museum's own signage: pale, boxy,
 * and carrying a room with nothing in it because the real building has a
 * courtyard there. This says the same thing in the language the rest of the
 * exhibition already speaks: dark ground, hairline rules, the painter's name
 * set large and the work's title under it, and nothing listed that you cannot
 * walk into.
 *
 * DOM rather than SVG for crisp type, real click targets, keyboard order and
 * screen-reader access. Esc returns to the corridor; choosing a work starts T3.
 */
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useStore } from '../state/store';
import { pointer } from '../state/motion';
import type { MuseumRoom } from '../types';

export function MapOverlay() {
  const phase = useStore((s) => s.phase);
  const museum = useStore((s) => s.museum);
  const setPhase = useStore((s) => s.setPhase);
  const setIndex = useStore((s) => s.setIndex);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The entrance is a GSAP tween rather than a CSS keyframe. Every other
  // transition in the app is already rAF-driven, and a compositor-driven CSS
  // animation can sit at 0% — leaving the index invisible and the exhibition
  // unnavigable — anywhere the compositor is idle while rAF keeps running.
  useEffect(() => {
    if (phase !== 'map' || !rootRef.current) return;
    const tween = gsap.fromTo(
      rootRef.current,
      { opacity: 0, scale: reducedMotion ? 1 : 0.985 },
      { opacity: 1, scale: 1, duration: reducedMotion ? 0.05 : 0.4, ease: 'power3.out' },
    );
    return () => {
      tween.kill();
    };
  }, [phase, reducedMotion]);

  // parallax: the list drifts ±6px against the blurred room behind it
  useEffect(() => {
    if (phase !== 'map' || reducedMotion) return;
    let raf = 0;
    // Start at the offset the current pointer position implies, rather than at
    // zero. Easing in from the centre means the list slides for a second or so
    // every time it opens, and the rows are real click targets — the visitor
    // should not have to chase one that is still arriving.
    const cur = { x: pointer.x * 6, y: pointer.y * 6 };
    if (listRef.current) {
      listRef.current.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
    }
    const tick = () => {
      const nx = cur.x + (pointer.x * 6 - cur.x) * 0.06;
      const ny = cur.y + (pointer.y * 6 - cur.y) * 0.06;
      // Stop writing transforms once the list has settled. Otherwise the rows
      // drift by fractions of a pixel forever, which costs a layer repaint
      // every frame and — because the rows are real click targets — leaves one
      // that is never quite standing still under the cursor.
      if (Math.abs(nx - cur.x) + Math.abs(ny - cur.y) > 0.01) {
        cur.x = nx;
        cur.y = ny;
        if (listRef.current) listRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reducedMotion]);

  if (phase !== 'map' || !museum) return null;

  const select = (room: MuseumRoom) => {
    if (!room.active) return;
    setIndex(Math.max(0, room.artworkIndex));
    setPhase('warp');
  };

  // only rooms that actually hold a painting: the plan's courtyards and
  // stairwells are part of the building, not part of the exhibition
  const rooms = museum.plan.rooms.filter((r) => r.active && r.artworkIndex >= 0);

  return (
    <div
      className="map-overlay"
      ref={rootRef}
      role="dialog"
      aria-label={`${museum.name} — choose a painting`}
    >
      {/*
       * The back control and the room name sit exactly where they sit in the
       * corridor and the gallery — fixed to the top corners, not floated in
       * the column of type. They used to be inside the centred panel, which
       * put "back" in a different place on every screen and made leaving a
       * room a small hunt.
       */}
      <button className="caption gallery-back" onClick={() => setPhase('corridor')}>
        ← {museum.name}
      </button>
      <p className="caption corridor-title">{museum.plan.level}</p>

      <div className="map-inner">
        <h2 className="display map-title">{museum.name}</h2>
        <p className="meta map-lede">
          Every painting here has a room to itself. Click one below to walk into it.
        </p>

        <ul className="room-list" ref={listRef}>
          {rooms.map((room, i) => {
            const art = museum.artworks[room.artworkIndex];
            return (
              <li key={room.id}>
                <button
                  className="room-row"
                  onClick={() => select(room)}
                  aria-label={
                    art
                      ? `Enter the room of ${art.title} by ${art.artist}`
                      : `Enter the ${room.name} room`
                  }
                >
                  <span className="caption room-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="room-text">
                    <span className="room-artist">{art?.artist ?? room.name}</span>
                    {art && <span className="caption room-title">{art.title}</span>}
                  </span>
                  <span className="caption room-cue" aria-hidden>
                    Enter →
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="caption map-footnote">
          {rooms.length} paintings · {museum.city}
        </p>
      </div>
    </div>
  );
}
