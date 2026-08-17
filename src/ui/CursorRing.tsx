/**
 * Custom cursor — spec §10C.7.
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

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      const t = e.target as HTMLElement | null;
      interactive = !!t?.closest('button, a, [role="button"], .map-room.is-active');
    };
    const onDown = () => (down = true);
    const onUp = () => (down = false);

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.35;
      cur.y += (target.y - cur.y) * 0.35;
      const el = ref.current;
      if (el) {
        el.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
        el.classList.toggle('is-interactive', interactive);
        el.classList.toggle('is-down', down);
      }
      raf = requestAnimationFrame(tick);
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
      cancelAnimationFrame(raf);
    };
  }, [fine]);

  if (!fine) return null;
  return (
    <div ref={ref} className="cursor-ring" aria-hidden>
      <span className="cursor-dot" />
    </div>
  );
}
