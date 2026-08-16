/**
 * Custom cursor — spec §10C.7. Desktop pointer:fine only; damped ring at
 * k = 0.35 (tighter than parallax damping, or it feels laggy).
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

export function CursorRing() {
  const ref = useRef<HTMLDivElement>(null);
  const [fine] = useState(() => matchMedia('(pointer: fine)').matches);
  const phase = useStore((s) => s.phase);
  const revealed = useStore((s) => s.revealed);

  useEffect(() => {
    if (!fine) return;
    document.documentElement.classList.add('no-native-cursor');
    const cur = { x: innerWidth / 2, y: innerHeight / 2 };
    const target = { x: cur.x, y: cur.y };
    let interactive = false;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      const t = e.target as HTMLElement | null;
      interactive = !!t?.closest('button, a, [role="button"], .map-room.is-active');
    };
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.35;
      cur.y += (target.y - cur.y) * 0.35;
      const el = ref.current;
      if (el) {
        el.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
        el.classList.toggle('is-interactive', interactive);
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      document.documentElement.classList.remove('no-native-cursor');
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [fine]);

  if (!fine) return null;
  const showReveal = phase === 'gallery' && !revealed;
  return (
    <div ref={ref} className={`cursor-ring ${revealed ? 'is-contracted' : ''}`} aria-hidden>
      {showReveal && <span className="caption cursor-label">REVEAL</span>}
    </div>
  );
}
