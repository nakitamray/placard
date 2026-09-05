/**
 * Custom cursor
 *
 * The first iteration drew a dark ring, which is invisible on the landing page
 * and in the corridor, where almost everything is dark: the pointer simply
 * disappeared. This draws a thin light ring carrying its own dark contact
 * shadow, so it holds against a black vault and against the bone-coloured map
 * scrim without changing colour or growing a halo.
 *
 * Desktop pointer:fine only; damped at k = 0.35 — tighter than the scene
 * parallax, or the cursor feels like it is being dragged.
 */
import { useEffect, useRef, useState } from 'react';

export function CursorRing() {
  const ref = useRef<HTMLDivElement>(null);
  const [fine] = useState(() => matchMedia('(pointer: fine)').matches);

  useEffect(() => {
    if (!fine) return;
    document.documentElement.classList.add('no-native-cursor');
    const cur = { x: innerWidth / 2, y: innerHeight / 2 };
    const target = { x: cur.x, y: cur.y };
    let interactive = false;
    let down = false;
    let raf = 0;

    /*
     * The loop runs while the ring has ground to make up, and stops when it
     * has arrived.
     *
     * It used to run for the whole life of the page, writing the same
     * transform and toggling the same two classes sixty times a second at a
     * cursor that had not moved in ten minutes — and every one of those writes
     * is a composited layer update, on top of everything else this page is
     * asking the compositor for. Any of the three things the ring reflects —
     * where the pointer is, what it is over, whether it is down — wakes it
     * again, so nothing about how it behaves has changed.
     */
    const draw = () => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      el.classList.toggle('is-interactive', interactive);
      el.classList.toggle('is-down', down);
    };

    const tick = () => {
      // within a third of a pixel of the pointer is arrived
      const arrived = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) < 0.3;
      if (arrived) {
        cur.x = target.x;
        cur.y = target.y;
      } else {
        cur.x += (target.x - cur.x) * 0.35;
        cur.y += (target.y - cur.y) * 0.35;
      }
      draw();
      raf = arrived ? 0 : requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      const t = e.target as HTMLElement | null;
      interactive = !!t?.closest('button, a, [role="button"], .map-room.is-active');
      wake();
    };
    const onDown = () => {
      down = true;
      wake();
    };
    const onUp = () => {
      down = false;
      wake();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      document.documentElement.classList.remove('no-native-cursor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fine]);

  if (!fine) return null;
  return (
    <div ref={ref} className="cursor-ring" aria-hidden>
      <span className="cursor-dot" />
    </div>
  );
}
