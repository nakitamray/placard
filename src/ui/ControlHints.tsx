/**
 * The line of movement affordances along the bottom of the screen.
 *
 * Nothing in this exhibition is labelled — that is the point of it — so the
 * controls have to be stated somewhere, and the only honest place is quietly,
 * at the bottom, in the smallest type in the system. They start legible and
 * settle to a whisper after the first input rather than disappearing: someone
 * who looks down thirty seconds in should still find them, and someone who
 * never looks down should never notice them.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

interface Hint {
  keys?: string[];
  /** joins the keys, e.g. "or" between ⇧ and ⏎ */
  sep?: string;
  text: string;
}

const CORRIDOR: Hint[] = [
  { keys: ['↑', '↓'], text: 'walk' },
  { keys: ['⇧', '⏎'], sep: 'or', text: 'hurry to the end' },
  { text: 'move the mouse to look around · click a painting to enter' },
  { keys: ['+', '−'], text: 'zoom' },
  { keys: ['esc'], text: 'back' },
];

const GALLERY: Hint[] = [
  { keys: ['←', '→'], text: 'move between paintings' },
  { text: 'hover a canvas to see the painting · click to keep it' },
  { keys: ['space'], text: 'thread mode: hover any part to read its text' },
  { keys: ['+', '−'], text: 'lean in' },
  { keys: ['esc'], text: 'close · back' },
];

const MAP: Hint[] = [
  { text: 'click any painting in the list to walk into its room' },
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
    <div
      className={`control-hints caption ${settled ? 'is-settled' : ''}`}
      aria-hidden
    >
      {hints.map((h, i) => (
        <span key={i} className="control-hint">
          {h.keys?.map((k, j) => (
            <span key={k}>
              {j > 0 && <span className="hint-sep">{h.sep ?? ''}</span>}
              <kbd>{k}</kbd>
            </span>
          ))}
          {h.text}
        </span>
      ))}
    </div>
  );
}
