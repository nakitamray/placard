/**
 * The door for small and upright screens.
 *
 * This exhibition is a corridor. A corridor seen through a portrait phone is a
 * letterbox with a wall on either side of it — the vault is off the top, the
 * hang is off the sides, and the one thing the room is for, walking down it,
 * has nowhere to go. Every attempt to make that work ends in a different
 * exhibition wearing this one's name.
 *
 * So a portrait screen is asked to turn rather than served a worse version.
 * The notice says what to do and shows it: a phone rotating a quarter turn,
 * over and over, which is the whole instruction and needs no translating.
 *
 * IT IS AN OVERLAY, NOT A BRANCH. The exhibition stays mounted underneath —
 * turning a device back and forth mid-visit must not reload the room, throw
 * away the WebGL context, or put the visitor back at the front door.
 */
import { useEffect, useState } from 'react';

/**
 * Narrower than this and there is no room for a corridor at any orientation.
 * A phone on its side is 667–932 across, so the bar sits under every one of
 * them and above nothing anybody browses on.
 */
const MIN_WIDTH = 620;
/** and the room needs height to be a room rather than a slot */
const MIN_HEIGHT = 380;

function blocked(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return h > w || w < MIN_WIDTH || h < MIN_HEIGHT;
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

  const narrow = window.innerWidth < MIN_WIDTH && window.innerWidth >= window.innerHeight;

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
          {narrow ? 'This screen is a little narrow' : 'Turn your device'}
        </h1>
        <p className="body turn-note">
          {narrow
            ? 'Placard is a corridor you walk down, and it needs a wider window than this one. Try a tablet or a desktop.'
            : 'Placard is a corridor you walk down. Hold your device sideways — or open it on a tablet or a desktop.'}
        </p>
      </div>
    </div>
  );
}
