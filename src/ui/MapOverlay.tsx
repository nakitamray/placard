/**
 * Map overlay — spec §10.3 / §10C.4. DOM/SVG for crisp type, real click
 * targets, keyboard navigation and screen-reader access. Rooms are the plan
 * authored in data/museums/{id}.json; inactive wings render greyed out. Esc
 * returns to the corridor; selecting a room starts T3.
 *
 * This is where the visitor chooses a painter, so it is also where the
 * exhibition has to say so out loud — hence the line under the plan.
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
  const planRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The entrance is a GSAP tween rather than a CSS keyframe. Every other
  // transition in the app is already rAF-driven, and a compositor-driven CSS
  // animation can sit at 0% — leaving the plan invisible and the exhibition
  // unnavigable — anywhere the compositor is idle while rAF keeps running.
  useEffect(() => {
    if (phase !== 'map' || !rootRef.current) return;
    const tween = gsap.fromTo(
      rootRef.current,
      { opacity: 0, scale: reducedMotion ? 1 : 0.96 },
      { opacity: 1, scale: 1, duration: reducedMotion ? 0.05 : 0.4, ease: 'power3.out' },
    );
    return () => {
      tween.kill();
    };
  }, [phase, reducedMotion]);

  // parallax: plan ±10px, labels ride along (spec §10B.3)
  useEffect(() => {
    if (phase !== 'map' || reducedMotion) return;
    let raf = 0;
    // Start at the offset the current pointer position implies, rather than at
    // zero. Easing in from the centre means the plan slides for a second or so
    // every time it opens, and the rooms are real click targets — the visitor
    // should not have to chase one that is still arriving.
    const cur = { x: pointer.x * 10, y: pointer.y * 10 };
    if (planRef.current) {
      planRef.current.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
    }
    const tick = () => {
      const nx = cur.x + (pointer.x * 10 - cur.x) * 0.06;
      const ny = cur.y + (pointer.y * 10 - cur.y) * 0.06;
      // Stop writing transforms once the plan has settled. Otherwise the rooms
      // drift by fractions of a pixel forever, which costs a layer repaint
      // every frame and — because the plan is made of real click targets —
      // leaves a room that is never quite standing still under the cursor.
      if (Math.abs(nx - cur.x) + Math.abs(ny - cur.y) > 0.01) {
        cur.x = nx;
        cur.y = ny;
        if (planRef.current) planRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reducedMotion]);

  if (phase !== 'map' || !museum) return null;

  const { plan } = museum;
  const select = (room: MuseumRoom) => {
    if (!room.active) return;
    setIndex(Math.max(0, room.artworkIndex));
    setPhase('warp');
  };

  const inactive = plan.rooms.filter((r) => !r.active);

  return (
    <div
      className="map-overlay"
      ref={rootRef}
      role="dialog"
      aria-label={`${museum.name} floor plan`}
    >
      <header className="map-header">
        <button className="caption map-back" onClick={() => setPhase('corridor')}>
          ← Back to the corridor
        </button>
        <span className="caption">{plan.level}</span>
      </header>
      <h2 className="display map-title">{museum.name}</h2>
      <p className="meta map-lede">{museum.blurb}</p>
      <div className="map-plan" ref={planRef}>
        <svg viewBox={plan.viewBox} className="map-svg">
          {plan.rooms.map((room) => (
            <g key={room.id}>
              <path
                d={room.svgPath}
                className={`map-room ${room.active ? 'is-active' : 'is-inactive'}`}
                tabIndex={room.active ? 0 : -1}
                role={room.active ? 'button' : undefined}
                aria-label={room.active ? `Enter the ${room.name} room` : undefined}
                onClick={() => select(room)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') select(room);
                }}
              />
              <text
                x={room.centroid[0]}
                y={room.centroid[1]}
                className={`map-label caption ${room.active ? '' : 'is-inactive'}`}
              >
                {room.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="meta map-footnote">
        {museum.artworks.length} paintings · {museum.city}
      </p>
      {inactive.length > 0 && (
        <p className="caption map-footnote-sub">
          {inactive.map((r) => r.name).join(' · ')} — not part of this exhibition.
        </p>
      )}
    </div>
  );
}
