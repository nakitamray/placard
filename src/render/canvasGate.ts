/**
 * Whether the corridor is worth drawing at this instant.
 *
 * Three things in the exhibition put something opaque over the whole canvas:
 * the atlas, which is a second WebGL canvas of its own; the map, which is a
 * scrim over a fourteen-pixel blur of the room; and the credits sheet. A
 * fourth is the visitor switching to another tab. In every one of them the
 * corridor carried on being lit, shadowed, reflected and redrawn behind
 * something nobody could see through.
 *
 * This is the one place that decides. `FrameGovernor` reads it and simply
 * stops advancing the frame loop, which leaves the last frame on the canvas —
 * so the blurred backdrop under the map is still there, still blurred, and
 * now costs nothing to keep.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { useAtlas } from '../state/atlas';

/**
 * How long the room keeps running after the map opens.
 *
 * Opening the map is the end of a walk: the camera is still easing the last
 * few centimetres into the end wall when the scrim comes down. Freezing on the
 * same frame as the overlay would catch it mid-stride and hold it there for as
 * long as the map is open, which is what you see again on the way back out.
 * A beat is enough for everything damped to arrive.
 */
const MAP_SETTLE_MS = 800;

/** true while the main canvas is showing something anybody can see */
export function useCanvasLive(): boolean {
  const phase = useStore((s) => s.phase);
  const creditsOpen = useStore((s) => s.creditsOpen);
  const atlasOpen = useAtlas((s) => s.open);

  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // the map's grace period, so the walk finishes before the room is held
  const [mapSettled, setMapSettled] = useState(false);
  useEffect(() => {
    if (phase !== 'map') {
      setMapSettled(false);
      return;
    }
    const t = window.setTimeout(() => setMapSettled(true), MAP_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (!visible) return false;
  if (atlasOpen || creditsOpen) return false;
  if (phase === 'map' && mapSettled) return false;
  return true;
}
