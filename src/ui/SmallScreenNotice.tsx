/**
 * The one thing a phone is told on the way in.
 *
 * A portrait phone is no longer turned away (see OrientationGate), and that
 * decision comes with an obligation: the visitor should know, once, that what
 * they are holding is the small version. Not because anything is broken here —
 * the rooms walk, the paintings zoom, the threads pull — but because the
 * corridor was composed for a wide window and it is worth saying so before
 * somebody decides the exhibition is cramped rather than that their screen is.
 *
 * ONCE, AND DISMISSIBLE, AND NOT A DOOR. It sits at the bottom, over the
 * entrance, with the exhibition fully usable behind it; it remembers having
 * been read; and it goes by itself if it is ignored, because a notice that has
 * to be dismissed is a toll booth. A tablet is not shown it at all — 768 across
 * is a real room, and telling that visitor their screen is small would be
 * false.
 */
import { useEffect, useState } from 'react';
import { useDeviceClass } from '../lib/device';

const SEEN = 'placard:small-screen-notice';

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    // private mode, or storage refused: showing it again is the harmless way
    // to be wrong
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    /* nothing to do, and nothing worth saying */
  }
}

export function SmallScreenNotice({ ready }: { ready: boolean }) {
  const device = useDeviceClass();
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const close = () => {
    remember();
    setLeaving(true);
    window.setTimeout(() => setShown(false), 320);
  };

  /*
   * Held back until the curtain is up. Arriving during the loading screen it
   * would be read and dismissed before the exhibition it is describing has
   * been seen, which is a notice about nothing.
   */
  useEffect(() => {
    if (!ready || device !== 'phone' || seen()) return;
    const t = window.setTimeout(() => setShown(true), 900);
    return () => window.clearTimeout(t);
  }, [ready, device]);

  // ignored is an answer too: it leaves on its own and does not come back
  useEffect(() => {
    if (!shown || leaving) return;
    const t = window.setTimeout(close, 11000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, leaving]);

  if (!shown) return null;

  return (
    <div className={`small-notice ${leaving ? 'is-leaving' : ''}`} role="status">
      <div className="small-notice-body">
        <p className="caption small-notice-eyebrow">A note on this screen</p>
        <p className="body small-notice-text">
          Placard is a corridor, composed for a wide window. It all works here — turn
          your phone sideways for more of it, or open it on a desktop for the exhibition
          as it was built.
        </p>
      </div>
      <button className="caption small-notice-close" onClick={close}>
        Got it
      </button>
    </div>
  );
}
