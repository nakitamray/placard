/**
 * How often the room is drawn, and whether it is drawn at all.
 *
 * A react-three-fiber canvas left to itself renders on every animation frame
 * for as long as it is mounted. For a scene like this one that is two separate
 * kinds of waste:
 *
 *   TOO OFTEN   The room is a slow drift — a camera easing along a rail,
 *               letters breathing, dust falling. None of it resolves faster
 *               than the eye does. On a 120Hz laptop panel the uncapped loop
 *               draws the whole corridor twice for every change a visitor
 *               could possibly see, and the only thing that reports the
 *               difference is the fan.
 *
 *   WHEN UNSEEN The atlas is a second canvas over the top of this one. The
 *               map is a full-bleed scrim over a blurred backdrop. The credits
 *               are a sheet. In all three the corridor is either invisible or
 *               a still frame behind fourteen pixels of blur — and it was
 *               being redrawn, lit, shadowed and reflected, several dozen
 *               times a second underneath them.
 *
 * So the canvas runs on `frameloop="never"` and this drives it: one animation
 * frame callback that decides whether this frame is worth drawing, and calls
 * r3f's `advance` when it is. Nothing else about the scene changes — every
 * `useFrame` in the exhibition still receives a real elapsed delta, because
 * the clock this keeps only counts the time it actually hands over.
 */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * The longest delta any frame is allowed to be worth, in seconds.
 *
 * Coming back from a hidden tab, or from a minute spent in the atlas, the wall
 * clock has moved and the room has not. Handing that gap to the frame loop as
 * one delta would resolve every damped value in a single step: the camera
 * would be somewhere else, mid-stride, the moment you looked back at it.
 * Capping it means the room picks up where it was left, which is what a room
 * does.
 *
 * A tenth of a second, not a sixtieth: the cap exists to catch a gap of
 * seconds, and a machine genuinely managing twelve frames a second should
 * still see its animations run at the speed they were written at, in fewer
 * steps, rather than in slow motion. Same figure the reading lens and the
 * corpus already clamp to.
 */
const MAX_STEP = 0.1;

export function FrameGovernor({ maxFps, running }: { maxFps: number; running: boolean }) {
  const advance = useThree((s) => s.advance);
  /** scene time, in seconds, counting only the frames that were drawn */
  const elapsed = useRef(0);

  useEffect(() => {
    if (!running) return;
    /*
     * A hair under the true interval. Asked for 60 on a 60Hz panel, a strict
     * 16.667ms gate loses every frame that arrives a fraction early and the
     * room runs at thirty. The slack is smaller than any frame that would
     * make it through the next gate up, so it can never let one extra past.
     */
    const interval = 1000 / maxFps - 2;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      if (dt < interval) return;
      last = now;
      elapsed.current += Math.min(dt / 1000, MAX_STEP);
      advance(elapsed.current);
    };

    // draw one immediately, so a resumed canvas is never a frame behind
    elapsed.current += 1 / 60;
    advance(elapsed.current);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance, maxFps, running]);

  /*
   * A paused canvas still has to redraw when the window changes shape.
   *
   * The frame it is holding was drawn for the old viewport; left alone it
   * would be stretched across the new one until something resumed the loop —
   * which, behind the map, is not until the visitor leaves it.
   */
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (running) return;
    elapsed.current += 1 / 60;
    advance(elapsed.current);
  }, [advance, running, size]);

  return null;
}
