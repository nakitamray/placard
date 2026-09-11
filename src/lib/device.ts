/**
 * What kind of thing is this being looked at on.
 *
 * The exhibition was built for a desk: a wide window, a cursor that can hover,
 * a keyboard with Escape and a space bar on it. None of those are safe
 * assumptions on a phone, and several of the controls were written as though
 * they were — a hint line that names keys nobody has, a thread mode whose only
 * switch is a keystroke, a zoom that is a pinch and nothing else.
 *
 * So the device is asked once, plainly, and everything that needs to differ
 * reads the answer from here rather than each inventing its own media query.
 *
 * WIDTH, NOT ORIENTATION. The corridor needs horizontal room, and a portrait
 * tablet at 768 has more of it than a landscape phone at 667 — so a rule that
 * keys off `height > width` locks out the wider device and admits the narrower
 * one. The only honest question is how many pixels across the room gets.
 */
import { useEffect, useState } from 'react';

export type DeviceClass = 'desktop' | 'tablet' | 'phone';

/**
 * Below this the room is a slot rather than a corridor, and every control on
 * screen is fighting the others for the same forty pixels.
 */
export const PHONE_MAX = 700;
/** and above this there is enough width that nothing needs apologising for */
export const TABLET_MAX = 1024;

/**
 * A pointer that cannot hover, which is the thing that actually matters — not
 * the screen size. A touch laptop reports coarse and fine both; `any-hover`
 * separates a device that has a mouse somewhere from one that has none.
 */
export function isTouch(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-hover: hover)').matches;
}

export function deviceClass(): DeviceClass {
  if (typeof window === 'undefined') return 'desktop';
  /*
   * The input device decides, not the width. A desktop window dragged narrow
   * still has a keyboard and a cursor, and telling that visitor to "swipe to
   * move" because their window is 640 wide would be a worse instruction than
   * the one it replaced. Width only separates the two touch classes.
   */
  if (!isTouch()) return 'desktop';
  return window.innerWidth <= PHONE_MAX ? 'phone' : 'tablet';
}

/**
 * The device class, kept current.
 *
 * Turning a tablet is a resize, not a reload — the exhibition stays mounted
 * through it (see OrientationGate) — so anything that changes wording or
 * controls by device has to re-read on resize or it will be describing the
 * orientation the visitor was in a minute ago.
 */
export function useDeviceClass(): DeviceClass {
  const [cls, setCls] = useState<DeviceClass>(deviceClass);
  useEffect(() => {
    const check = () => setCls(deviceClass());
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    // iOS reports the pre-rotation size on the orientationchange itself
    const settle = () => window.setTimeout(check, 250);
    window.addEventListener('orientationchange', settle);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      window.removeEventListener('orientationchange', settle);
    };
  }, []);
  return cls;
}

/** true on a phone or a tablet — anywhere there is no cursor and no keyboard */
export function useIsTouch(): boolean {
  return useDeviceClass() !== 'desktop';
}
