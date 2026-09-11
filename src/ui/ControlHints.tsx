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
import { useIsTouch } from '../lib/device';

interface Hint {
  keys?: string[];
  text: string;
}

/*
 * TWO SETS, BECAUSE THERE ARE TWO MACHINES.
 *
 * The line below the room says how to get through it, and for a long time it
 * said so in keys: arrows to walk, Shift to hurry, space for thread mode, Esc
 * to go back. On a phone every one of those is an instruction to press
 * something that does not exist — which is worse than no hint line at all,
 * because it tells the visitor the thing they want is unreachable when in fact
 * it is under their thumb.
 *
 * So the same moves are named twice, once per input device, and the room picks
 * the set that matches the hands on it. Touch loses Esc entirely — the way back
 * is the control in the top corner, which is on screen the whole time and is
 * what a visitor with no keyboard was going to use anyway.
 */
const CORRIDOR: Hint[] = [
  { keys: ['↑', '↓'], text: 'walk' },
  { keys: ['⇧'], text: 'hurry to the end' },
  { text: 'move the mouse to look' },
  { text: 'click a painting' },
  { keys: ['esc'], text: 'back' },
];

const CORRIDOR_TOUCH: Hint[] = [
  { text: 'swipe up to walk' },
  { text: 'tap a painting to enter it' },
  { text: '“to the end” skips ahead' },
];

const GALLERY: Hint[] = [
  { keys: ['←', '→'], text: 'move' },
  { text: 'click for the placard' },
  { keys: ['space'], text: 'thread mode' },
  { keys: ['esc'], text: 'back' },
];

/*
 * Three, not four. The line wraps to three rows on a phone at four items and
 * then sits on top of the rail indicator above it — and the fourth was
 * "'threads' reads the text behind it", which names a control that is on
 * screen, labelled, in the corner. The floor of a gallery is for the moves
 * that have no other sign; everything else is in the help card.
 */
const GALLERY_TOUCH: Hint[] = [
  { text: 'swipe to move between works' },
  { text: 'tap for the placard' },
  { text: 'pinch to look closer' },
];

const MAP: Hint[] = [
  { text: 'click a room to walk into it' },
  { keys: ['esc'], text: 'back to the corridor' },
];

const MAP_TOUCH: Hint[] = [{ text: 'tap a room to walk into it' }];

export function ControlHints() {
  const phase = useStore((s) => s.phase);
  const touch = useIsTouch();
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
    phase === 'corridor'
      ? touch
        ? CORRIDOR_TOUCH
        : CORRIDOR
      : phase === 'gallery'
        ? touch
          ? GALLERY_TOUCH
          : GALLERY
        : phase === 'map'
          ? touch
            ? MAP_TOUCH
            : MAP
          : null;
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
