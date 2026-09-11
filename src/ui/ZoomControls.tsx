/**
 * Lean in, lean back — with a thumb.
 *
 * Standing closer to a painting is the one thing a gallery is for, and until
 * now the only ways to ask for it were `+`, `-`, a modifier held on a scroll
 * wheel, and a trackpad pinch. A phone has none of the first three and its
 * pinch, while it works (see attachZoom), is a gesture nobody is told about on
 * a page that is not a map.
 *
 * So the gesture gets a face: two marks and a way back to the composed
 * distance, in the corner opposite the sound switch, only where there is no
 * cursor to do it the other way. Everything here goes through the same
 * `zoomIn`/`zoomOut` the keys use, so there is one zoom with several doors and
 * not several zooms.
 */
import { useEffect, useState } from 'react';
import { resetZoom, view, zoomAtMax, zoomAtMin, zoomIn, zoomOut } from '../state/motion';

export function ZoomControls() {
  /*
   * `view` is mutated per frame outside React — that is the whole point of it —
   * so this samples rather than subscribes. Four times a second is far below
   * what the eye reads as lag on a label, and far above what a re-render every
   * frame would cost a room that is already drawing one.
   */
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);

  const atComposed = Math.abs(view.goal - 1) < 0.02;

  return (
    <div className="zoom-controls caption" role="group" aria-label="Zoom">
      <button
        className="zoom-btn"
        onClick={zoomOut}
        disabled={zoomAtMin()}
        aria-label="Zoom out"
      >
        −
      </button>
      {/* the way back, which only exists once there is something to go back
          from — a reset that is always lit is a button that usually does
          nothing */}
      <button
        className={`zoom-btn zoom-reset ${atComposed ? 'is-idle' : ''}`}
        onClick={resetZoom}
        disabled={atComposed}
        aria-label="Back to the composed distance"
      >
        {atComposed ? '1×' : `${view.goal.toFixed(1)}×`}
      </button>
      <button className="zoom-btn" onClick={zoomIn} disabled={zoomAtMax()} aria-label="Zoom in">
        +
      </button>
    </div>
  );
}
