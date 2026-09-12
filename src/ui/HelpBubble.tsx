/**
 * The ? in the corner, and the card behind it.
 *
 * The line along the bottom says the four moves that get you through the room
 * you are standing in. It cannot also explain the reading lens, or what thread
 * mode is for, or that the wheel works as well as the arrows — that is a
 * paragraph, and a paragraph across the floor of a gallery is a manual taped
 * to a wall.
 *
 * So the paragraph lives here: one mark, next to the quality words, where a
 * visitor who wants to be told everything can be told everything, and everyone
 * else never sees it. It closes on Escape, on a click anywhere else, and on
 * leaving the room, because a help card that has to be dismissed twice is a
 * worse problem than the one it solves.
 */
import { useEffect, useRef, useState } from 'react';
import { useIsTouch } from '../lib/device';

interface Row {
  keys?: string[];
  text: string;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'In the corridor',
    rows: [
      { keys: ['↑', '↓'], text: 'walk — a tap is a step, a hold is a stride' },
      { keys: ['⇧'], text: 'hurry to the far end' },
      { text: 'move the mouse to look along either wall' },
      { text: 'the wheel, or a drag, also carries you along' },
      { text: 'click a canvas to walk into its room' },
    ],
  },
  {
    title: 'In front of a painting',
    rows: [
      { keys: ['←', '→'], text: 'move between the works, with a magnetic snap' },
      {
        text: 'hold the cursor over the canvas for the reading lens — a soft circle where the words give way and the paint shows through',
      },
      {
        keys: ['⏎'],
        text: 'or a click: the work dissolves out of its text and the wall label arrives',
      },
      {
        keys: ['space'],
        text: 'thread mode — rest on any part of the canvas to read the passage that drew it',
      },
      { keys: ['+', '−'], text: 'lean in and back; 0 returns to the composed distance' },
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      { keys: ['esc'], text: 'step back one level — painting, room, floor plan, entrance' },
      { text: '✦ The atlas, top of the screen: how the seventy works are joined to each other' },
      { text: 'sound is off until you turn it on, bottom left' },
    ],
  },
];

/*
 * The same paragraph, for hands instead of keys.
 *
 * Not a translation of the one above but a rewrite of it: several moves that
 * need explaining on a desk explain themselves on a touch screen (you swipe,
 * because that is what a screen you can touch is for), and several that are
 * one keystroke there are a named control here. Pretending otherwise gives a
 * phone a help card full of keys it has no way to press, which is the problem
 * this card was supposed to solve.
 */
const SECTIONS_TOUCH: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'In the corridor',
    rows: [
      { text: 'swipe up the screen to walk down the corridor' },
      { text: '“to the end”, top left, takes you straight to the far wall' },
      { text: 'tap a canvas on either wall to walk into its room' },
      { text: 'the museum’s name, top right, opens the real museum’s own site' },
    ],
  },
  {
    title: 'In front of a painting',
    rows: [
      { text: 'swipe left and right to move between the works' },
      { text: 'tap the canvas: the work dissolves out of its own text and the wall label arrives' },
      {
        text: 'pinch to look closer, or use − and + at the bottom right; the figure between them returns you to the composed distance',
      },
      {
        text: '“threads”, bottom left, turns on thread mode — then tap any part of the canvas to read the passage that drew it',
      },
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      { text: 'the control in the top left corner is always the way back' },
      { text: '✦ The atlas, top of the screen: how the seventy works are joined to each other' },
      { text: 'in the atlas, drag to turn the web and pinch to come closer' },
      { text: 'sound is off until you turn it on, bottom left' },
    ],
  },
];

export function HelpBubble() {
  const touch = useIsTouch();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="help" ref={box}>
      {open && (
        <div className="help-card" role="dialog" aria-label="How to get around">
          <p className="caption help-head">Getting around</p>
          {(touch ? SECTIONS_TOUCH : SECTIONS).map((s) => (
            <section key={s.title} className="help-section">
              <h3 className="caption help-title">{s.title}</h3>
              <ul className="help-rows">
                {s.rows.map((r, i) => (
                  <li key={i} className="help-row">
                    {r.keys && (
                      <span className="help-keys">
                        {r.keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                    )}
                    <span className="help-text">{r.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <button
        className={`help-mark caption ${open ? 'is-on' : ''}`}
        aria-expanded={open}
        aria-label="How to get around"
        title="How to get around"
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
    </div>
  );
}
