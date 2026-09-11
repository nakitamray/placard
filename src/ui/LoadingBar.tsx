/**
 * The entrance curtain.
 *
 * A loading screen on a site like this one has two honest jobs and one
 * dishonest temptation. The jobs: cover a stall that genuinely has to happen
 * — the shader compile, which cannot be made free, only moved — and say
 * truthfully how far along it is. The temptation is to fill the wait with
 * decoration, and decoration is what makes a loading screen feel like an
 * imposition rather than a threshold.
 *
 * So there is no spinner and no percentage. There is the wordmark, a gilt
 * rule measuring three real pieces of work, the name of the one still
 * outstanding — and the wall text of the painting that is about to appear.
 *
 * That last part is the whole idea of the exhibition, arriving before the
 * exhibition does. Every picture here is drawn out of the writing about it,
 * so the first thing a visitor reads is the writing the first picture is made
 * of, and then the curtain lifts on that picture standing behind the words
 * they have just read. The wait is not covered up. It is used.
 *
 * `closing` is the fade: the scene behind has been live for a beat before
 * this goes, so what is uncovered is a room already running rather than a
 * room starting.
 */
import { BOOT_STEPS, bootProgress, bootWaitingFor, useBoot } from '../state/boot';

/** enough of the label to be worth reading, cut at a sentence rather than mid-word */
function opening(text: string, max = 260): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  // trailing dashes and commas before an ellipsis read as a typo, not a cut
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s—–-]+$/, '')}…`;
}

export function LoadingBar({ closing = false }: { closing?: boolean }) {
  const done = useBoot((s) => s.done);
  const line = useBoot((s) => s.line);
  const credit = useBoot((s) => s.credit);
  const progress = bootProgress(done);
  const waiting = bootWaitingFor(done);

  return (
    <div
      className={`loading ${closing ? 'is-closing' : ''}`}
      role="status"
      aria-label="Preparing the gallery"
    >
      {/* The words first. They are the reason to be here, and they are also
          the only thing on this screen that rewards the second the visitor
          spends looking at it. */}
      <div className="loading-text">
        {line && (
          <>
            <p className="body loading-line">{opening(line)}</p>
            <p className="caption loading-credit">{credit}</p>
          </>
        )}
      </div>

      <div className="loading-foot">
        <p className="caption loading-word">PLACARD</p>
        {/* what is still outstanding, named — a bar that only moves says the
            page is busy; a bar that says what it is busy with says the page
            is working */}
        <p className="caption loading-step" aria-live="polite">
          {waiting ? waiting.label : 'Opening'}
          <span className="loading-count">
            {' · '}
            {done.length}/{BOOT_STEPS.length}
          </span>
        </p>
      </div>
      <div className="loading-rule" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
