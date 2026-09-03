/**
 * "A connection appeared."
 *
 * The atlas grows while you are looking at something else — you pull a thread
 * to read it, and a link is uncovered as a side effect. If that happens
 * silently the mechanic is invisible, and if it happens loudly it interrupts
 * the passage you were reading. So: one line, low in the corner, naming what
 * was found and nothing more, and it goes on its own.
 */
import { useEffect } from 'react';
import { useAtlas } from '../state/atlas';

export function AtlasToast() {
  const latest = useAtlas((s) => s.latest);
  const clear = useAtlas((s) => s.clearLatest);
  const open = useAtlas((s) => s.open);
  const setOpen = useAtlas((s) => s.setOpen);

  useEffect(() => {
    if (!latest) return;
    const t = window.setTimeout(clear, 5200);
    return () => window.clearTimeout(t);
  }, [latest, clear]);

  if (!latest || open) return null;

  return (
    <button className="atlas-toast" onClick={() => setOpen(true)}>
      <span className="caption atlas-toast-eyebrow">A connection appeared</span>
      <span className="atlas-toast-body">
        {latest.kind} <em>{latest.label}</em>
      </span>
      <span className="caption atlas-toast-cue">Open the atlas →</span>
    </button>
  );
}
