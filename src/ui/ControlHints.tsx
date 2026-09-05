/**
 * The line of movement affordances along the bottom of the screen.
 *
 * Nothing in this exhibition is labelled — that is the point of it — so the
 * controls have to be stated somewhere, and the only honest place is quietly,
 * at the bottom, in the smallest type in the system.
 *
 * ONE LINE, NOT FIVE. Five lines of instructions under a painting is a manual
 * taped to a wall: it is read once, ignored afterwards, and in between it is
 * the loudest thing on the screen. So the two moves that actually get you
 * through a room are always shown, and everything else — zoom, thread mode,
 * the way back — is one keystroke behind a mark at the end of the line. All of
 * it is still there; none of it is in the way.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

interface Hint {
  keys?: string[];
  /** joins the keys, e.g. "or" between ⇧ and ⏎ */
  sep?: string;
  text: string;
  /** shown without asking — the moves that get you through the room */
  always?: boolean;
}

const CORRIDOR: Hint[] = [
  { keys: ['↑', '↓'], text: 'walk', always: true },
  { text: 'click a painting', always: true },
  { keys: ['⇧', '⏎'], sep: 'or', text: 'hurry to the end' },
  { text: 'move the mouse to look around' },
  { keys: ['+', '−'], text: 'zoom' },
  { keys: ['esc'], text: 'back' },
];

const GALLERY: Hint[] = [
  { keys: ['←', '→'], text: 'move', always: true },
  { text: 'click for the painting', always: true },
  { text: 'move over the canvas for the reading lens' },
  { keys: ['space'], text: 'thread mode: rest on any part to read its text' },
  { keys: ['+', '−'], text: 'lean in' },
  { keys: ['esc'], text: 'close · back' },
];

const MAP: Hint[] = [
  { text: 'click a painting to walk into its room', always: true },
  { keys: ['esc'], text: 'back to the corridor' },
];

export function ControlHints() {
  const phase = useStore((s) => s.phase);
  const [settled, setSettled] = useState(false);
  const [open, setOpen] = useState(false);

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

  // the rest of the controls close themselves when you leave the room
  useEffect(() => setOpen(false), [phase]);

  const hints =
    phase === 'corridor' ? CORRIDOR : phase === 'gallery' ? GALLERY : phase === 'map' ? MAP : null;
  if (!hints) return null;

  const shown = open ? hints : hints.filter((h) => h.always);
  const rest = hints.length - hints.filter((h) => h.always).length;

  return (
    <div className={`control-hints caption ${settled ? 'is-settled' : ''} ${open ? 'is-open' : ''}`}>
      {shown.map((h, i) => (
        <span key={i} className="control-hint" aria-hidden>
          {h.keys?.map((k, j) => (
            <span key={k}>
              {j > 0 && <span className="hint-sep">{h.sep ?? ''}</span>}
              <kbd>{k}</kbd>
            </span>
          ))}
          {h.text}
        </span>
      ))}
      {rest > 0 && (
        <button
          className="control-more"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide the rest of the controls' : 'Show all the controls'}
        >
          {open ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}
