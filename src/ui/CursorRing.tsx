/**
 * Custom cursor
 *
 * The first iteration drew a dark ring, which is invisible on the landing page
 * and in the corridor, where almost everything is dark: the pointer simply
 * disappeared. This draws a thin light ring carrying its own dark contact
 * shadow, so it holds against a black vault and against the bone-coloured map
 * scrim without changing colour or growing a halo.
 *
 * Desktop pointer:fine only.
 *
 * WHY A DRAWN CURSOR FEELS SLOW, AND WHAT IS DONE ABOUT IT
 *   The native pointer is composited by the operating system and is exactly
 *   where the hand put it, always. Anything drawn in a page is behind that by
 *   construction: it can only move on an animation frame, and on this page an
 *   animation frame is also when a 3D room is being rendered. A frame that
 *   takes 25ms to draw is a cursor that updates every 25ms — and then the
 *   easing spends several more of those catching up. Three frames of damping
 *   at 60Hz is a smooth trailing ring; the same three frames at 25Hz is a
 *   cursor that visibly lags the hand, which is the single most irritating
 *   thing an interface can do.
 *
 *   So the two halves are separated. THE DOT IS EXACT — it is
 *   counter-translated against the ring every frame so it lands precisely on
 *   the real pointer position, with no easing at all, and the thing the
 *   visitor aims with is never behind their hand. THE RING TRAILS, which is
 *   the character the ring was for, and it now eases on a wall clock rather
 *   than per frame, so it takes the same fifth of a second to arrive whether
 *   the room is managing 60fps or 24.
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
    let last = 0;
    /** what `interactive` was last computed from, so it is computed once per element */
    let overEl: Element | null = null;

    /**
     * How long the ring takes to close the distance, in seconds.
     *
     * A time constant rather than a per-frame fraction: `cur += (target -
     * cur) * 0.35` means something completely different at 24fps than at 120,
     * and the frame rate here is whatever the room can manage.
     */
    const EASE = 0.055;

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
      placeDot();
      el.classList.toggle('is-interactive', interactive);
      el.classList.toggle('is-down', down);
    };

    /**
     * The dot, put back exactly where the pointer is.
     *
     * It is a child of the ring, so it inherits the ring's easing; this
     * cancels that out. The ring is free to trail — which is the character it
     * was drawn for — and the point the visitor is actually aiming with never
     * does.
     *
     * Called from the move handler as well as from the frame loop, so it does
     * not even wait for the next animation frame. A pointer event is
     * dispatched before the frame it belongs to is painted, so writing the
     * transform here puts the dot under the hand in that same frame; going
     * through the loop instead would cost one frame of latency on a page
     * where a frame can be 25ms long.
     */
    function placeDot() {
      const dot = ref.current?.firstElementChild as HTMLElement | null;
      if (dot) {
        dot.style.transform = `translate(${target.x - cur.x}px, ${target.y - cur.y}px)`;
      }
    }

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      // within a third of a pixel of the pointer is arrived
      const arrived = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) < 0.3;
      if (arrived) {
        cur.x = target.x;
        cur.y = target.y;
      } else {
        // frame-rate independent: the same distance in the same wall-clock
        // time whether this frame took 8ms or 40
        const k = 1 - Math.exp(-dt / EASE);
        cur.x += (target.x - cur.x) * k;
        cur.y += (target.y - cur.y) * k;
      }
      draw();
      raf = arrived ? 0 : requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      /*
       * `closest` walks up the DOM, and a gaming mouse reports a thousand
       * moves a second. Running that walk on every one of them was a real
       * cost on the main thread — the same thread the room is rendering on —
       * to answer a question whose answer only changes when the pointer
       * crosses from one element to another. So it is asked once per element
       * instead of once per event.
       */
      const t = e.target as Element | null;
      if (t !== overEl) {
        overEl = t;
        interactive = !!t?.closest('button, a, [role="button"], .map-room.is-active');
      }
      placeDot();
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
