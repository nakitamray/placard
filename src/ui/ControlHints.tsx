/**
 * The line of movement affordances along the bottom of the screen.
 *
 * Nothing in this exhibition is labelled — that is the point of it — so the
 * controls have to be stated somewhere, and the only honest place is quietly,
 * at the bottom, in the smallest type in the system.
 *
 * EVERYTHING, ONCE. An earlier version kept two moves on the line and put the
 * rest behind a "more" mark, which is worse than either extreme: the visitor
 * cannot see what they are missing, so they never press it, and the controls
 * they need are one click away in a place they have no reason to look. So the
 * whole set is here — but written as short as it can be said, four items to a
 * room, each one a key and a verb. Anything longer than a verb belongs in the
 * help card behind the ? in the corner, not on the floor of the gallery.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

interface Hint {
  keys?: string[];
  text: string;
}

const CORRIDOR: Hint[] = [
  { keys: ['↑', '↓'], text: 'walk' },
  { keys: ['⇧'], text: 'hurry to the end' },
  { text: 'move the mouse to look' },
  { text: 'click a painting' },
  { keys: ['esc'], text: 'back' },
];

const GALLERY: Hint[] = [
  { keys: ['←', '→'], text: 'move' },
  { text: 'click for the placard' },
  { keys: ['space'], text: 'thread mode' },
  { keys: ['esc'], text: 'back' },
];

const MAP: Hint[] = [
  { text: 'click a room to walk into it' },
  { keys: ['esc'], text: 'back to the corridor' },
];

export function ControlHints() {
  const phase = useStore((s) => s.phase);
  const [settled, setSettled] = useState(false);

  // any input at all means the controls have been found; from then on the line
  // stays available but stops asking to be read
  useEffect(() => {
    if (settled) return;
    const onInput = () => setSettled(true);
    const t = window.setTimeout(() => setSettled(true), 12000);
    window.addEventListener('keydown', onInput, { once: true });
    window.addEventListener('wheel', onInput, { once: true, passive: true });
    window.addEventListener('pointerdown', onInput, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('wheel', onInput);
      window.removeEventListener('pointerdown', onInput);
    };
  }, [settled]);

  const hints =
    phase === 'corridor' ? CORRIDOR : phase === 'gallery' ? GALLERY : phase === 'map' ? MAP : null;
  if (!hints) return null;

  return (
    <div className={`control-hints caption ${settled ? 'is-settled' : ''}`}>
      {hints.map((h, i) => (
        <span key={i} className="control-hint" aria-hidden>
          {h.keys?.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
          {h.text}
        </span>
      ))}
    </div>
  );
}
