/**
 * The door for screens that genuinely cannot hold the room.
 *
 * This used to turn away every portrait screen, and that was the wrong test
 * twice over. It locked out a portrait tablet — 768 across, which is more
 * corridor than a landscape phone's 667 ever gets — while waving that phone
 * through; and it met most arrivals, who hold a phone upright, with a wall
 * instead of an exhibition. A rotate-your-device screen at the front door is
 * the highest-bounce thing a site can own.
 *
 * So the question is no longer "is this portrait" but "is there anything that
 * can be built here at all", and the answer is yes almost everywhere: the
 * cameras widen to suit a tall window (see CorridorScene and GalleryScene),
 * the controls have touch equivalents, and a phone is told once, gently, that
 * this is better on a bigger screen (see SmallScreenNotice). Only a window
 * with no room for type at any orientation is still turned away.
 *
 * IT IS AN OVERLAY, NOT A BRANCH. The exhibition stays mounted underneath —
 * turning a device back and forth mid-visit must not reload the room, throw
 * away the WebGL context, or put the visitor back at the front door.
 */
import { useEffect, useState } from 'react';

/**
 * The floor, not the preference.
 *
 * 320 is the narrowest phone still sold and 300 of height is a landscape phone
 * with the browser's own chrome taking its cut. Under either there is no
 * layout — the hint line alone is wider than the window — so those are asked
 * to turn, and nothing else is.
 */
const MIN_WIDTH = 320;
const MIN_HEIGHT = 300;

function blocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT;
}

export function OrientationGate() {
  const [shut, setShut] = useState(blocked);

  useEffect(() => {
    const check = () => setShut(blocked());
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    // iOS reports the old size on the orientationchange itself
    const settle = () => window.setTimeout(check, 250);
    window.addEventListener('orientationchange', settle);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      window.removeEventListener('orientationchange', settle);
    };
  }, []);

  if (!shut) return null;

  // too narrow to lay out, versus too short — turning the device fixes only
  // one of them, so only one of them asks for it
  const narrow = window.innerWidth < MIN_WIDTH;

  return (
    <div className="turn" role="alertdialog" aria-label="Turn your device">
      <div className="turn-inner">
        <p className="caption turn-mark">Placard</p>

        {/* a phone, turning. The frame rotates a quarter turn and the screen
            inside it reproportions on the way round, which is the difference
            between an icon that spins and a device that turns. */}
        <div className="turn-anim" aria-hidden>
          <div className="turn-device">
            <div className="turn-screen" />
            <div className="turn-home" />
          </div>
        </div>

        <h1 className="turn-title">
          {narrow ? 'This window is too narrow' : 'Turn your device'}
        </h1>
        <p className="body turn-note">
          {narrow
            ? 'Placard is a corridor you walk down, and it needs more width than this. Try a wider window, a tablet, or a desktop.'
            : 'There is not enough height here to hold a room. Hold your device the other way up — or open it on a larger screen.'}
        </p>
      </div>
    </div>
  );
}
