/**
 * Map overlay — spec §10.3 / §10C.4. DOM/SVG for crisp type, real click
 * targets, keyboard navigation and screen-reader access. Rooms are
 * hand-drawn stylised paths from galleries/orsay.json; inactive wings render
 * greyed out. Esc returns to the corridor; selecting a room starts T3.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { pointer } from '../state/motion';
import type { GalleryRoom } from '../types';

export function MapOverlay() {
  const phase = useStore((s) => s.phase);
  const gallery = useStore((s) => s.gallery);
  const setPhase = useStore((s) => s.setPhase);
  const setIndex = useStore((s) => s.setIndex);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const planRef = useRef<HTMLDivElement>(null);

  // parallax: plan ±10px, labels ride along (spec §10B.3)
  useEffect(() => {
    if (phase !== 'map' || reducedMotion) return;
    let raf = 0;
    const cur = { x: 0, y: 0 };
    const tick = () => {
      cur.x += (pointer.x * 10 - cur.x) * 0.06;
      cur.y += (pointer.y * 10 - cur.y) * 0.06;
      if (planRef.current)
        planRef.current.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reducedMotion]);

  if (phase !== 'map' || !gallery) return null;

  const rooms = gallery.floors[0].rooms;
  const select = (room: GalleryRoom) => {
    if (!room.active) return;
    setIndex(Math.max(0, room.artworkIndex));
    setPhase('warp');
  };

  return (
    <div className="map-overlay" role="dialog" aria-label={`${gallery.name} floor plan`}>
      <header className="map-header">
        <button className="caption map-back" onClick={() => setPhase('corridor')}>
          ← Back
        </button>
        <span className="caption">Level {gallery.floors[0].level}</span>
      </header>
      <h2 className="display map-title">{gallery.name}</h2>
      <div className="map-plan" ref={planRef}>
        <svg viewBox="20 30 504 250" className="map-svg" aria-hidden={false}>
          {rooms.map((room) => (
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
      <p className="meta map-footnote">Five paintings · one exhibition</p>
      <p className="caption map-footnote-sub">Sculpture isn't part of this exhibition yet.</p>
    </div>
  );
}
