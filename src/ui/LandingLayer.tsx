/**
 * The entrance, as type.
 *
 * The background is the exhibition's own trick running live — one painting
 * drawn out of its corpus at full bleed, see scenes/LandingScene — and this
 * layer is everything over the top of it: the headline, the list of museums,
 * and a scrim dark enough to read against.
 *
 * `prefers-reduced-motion` gets a still slideshow instead, because a field of
 * several thousand drifting characters is precisely what that setting is
 * asking us not to render. It crossfades between the same works, using
 * the reproductions already published per artwork, and holds each one on its
 * own focal point so a tall canvas is not cropped through the face.
 *
 * Only two or three backgrounds are ever in the DOM. Mounting them all and
 * hiding all but one behind `opacity: 0` would not stop the browser fetching them — a
 * `background-image` is honoured whatever the element's opacity — so the
 * entrance costs one picture, and the next arrives during the seconds the
 * first one holds.
 */
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { loadMuseum, useStore } from '../state/store';
import { pointer } from '../state/motion';
import { imageUrl } from '../lib/image';
import { exhibitionWorks, heroWorks, shuffled, type ExhibitionWork } from '../state/works';
import { markOpening, useOpening, whenWritten } from '../state/opening';

const HOLD_MS = 7000;
/* Long, and linear. A short crossfade between two full-bleed paintings reads
   as a cut, and easing both layers at once dips the brightness in the middle
   of it. The outgoing slide is held at full opacity underneath while the
   incoming one fades in over it at a constant rate, so there is no dip and no
   moment where the change announces itself. */
const FADE_MS = 2600;

export function LandingLayer() {
  const phase = useStore((s) => s.phase);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const seenIntro = useStore((s) => s.seenIntro);
  const museums = useStore((s) => s.museums);
  const loadingId = useStore((s) => s.museumLoading);
  const setPhase = useStore((s) => s.setPhase);
  const setMuseum = useStore((s) => s.setMuseum);
  const setMuseumLoading = useStore((s) => s.setMuseumLoading);
  const setCreditsOpen = useStore((s) => s.setCreditsOpen);

  /*
   * The photographic fallback. Only ever fetched, mounted or animated when
   * the live hero is not running, so an ordinary visit does not pull ten
   * full-bleed JPEGs it will never show.
   */
  const stills = reducedMotion;
  const [images, setImages] = useState<ExhibitionWork[]>([]);
  /*
   * The slide showing and the one it came from, in one piece of state.
   *
   * A crossfade needs both indices to be true at the same instant, and there
   * is always a render between changing the slide and any effect that could
   * record the old one — changing slides also resets the preload timer. Two
   * values that must agree cannot be kept in two places.
   */
  const [slide, setSlide] = useState<{ cur: number; prev: number | null }>({
    cur: 0,
    prev: null,
  });
  const current = slide.cur;
  const prevIndex = slide.prev;
  const [warm, setWarm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** the one line that explains the lens — it goes as soon as it is obeyed */
  const [moved, setMoved] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stills) return;
    let alive = true;
    void exhibitionWorks().then((all) => {
      if (alive) setImages(shuffled(heroWorks(all)));
    });
    return () => {
      alive = false;
    };
  }, [stills]);

  // Hold the next slide back for a couple of seconds. Each one holds for seven,
  // so there is plenty of room to fetch it — and nothing should compete with
  // the first painting anyone sees.
  useEffect(() => {
    if (!stills) return;
    setWarm(false);
    const t = window.setTimeout(() => setWarm(true), 2000);
    return () => window.clearTimeout(t);
  }, [current, images, stills]);

  /*
   * The slideshow.
   *
   * It runs under reduced motion, because this path only exists under reduced
   * motion — and a cross-dissolve between two stills is not the thing that
   * setting is protecting anyone from. The Ken Burns creep is what is, and the
   * stylesheet turns that off. No explicit preload of the one after next: the
   * next slide is already mounted and fetching, and reaching further ahead is
   * how this page ends up downloading the whole set.
   */
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(
      () => setSlide((s) => ({ cur: (s.cur + 1) % images.length, prev: s.cur })),
      HOLD_MS,
    );
    return () => clearInterval(id);
  }, [images]);

  // The hero says what to do only until it has been done. One deliberate
  // pointer move across the painting and the line is never seen again.
  useEffect(() => {
    if (stills || moved) return;
    let n = 0;
    const onMove = () => {
      if (++n > 6) setMoved(true);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [stills, moved]);

  // pointer parallax: background inverse 24px, title direct 6px
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const cur = { bx: 0, by: 0, tx: 0 };
    const tick = () => {
      const nbx = cur.bx + (pointer.x * -24 - cur.bx) * 0.06;
      const nby = cur.by + (pointer.y * -24 - cur.by) * 0.06;
      const ntx = cur.tx + (pointer.x * 6 - cur.tx) * 0.06;
      // stop writing transforms once the layers have settled, so the DOM goes
      // quiet when the pointer does
      if (Math.abs(nbx - cur.bx) + Math.abs(nby - cur.by) + Math.abs(ntx - cur.tx) > 0.01) {
        cur.bx = nbx;
        cur.by = nby;
        cur.tx = ntx;
        if (bgRef.current) bgRef.current.style.transform = `translate(${nbx}px, ${nby}px)`;
        if (contentRef.current) contentRef.current.style.transform = `translate(${ntx}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // The slide showing; the one it came from, held at full opacity underneath
  // it; and the one it is about to move to, once there has been a moment to
  // spare for it. On first paint that is exactly one request instead of ten.
  const mounted = stills && images.length
    ? [
        ...new Set(
          [prevIndex, current, warm ? (current + 1) % images.length : null].filter(
            (i) => i !== null,
          ),
        ),
      ].map((i) => ({ i: i as number, work: images[i as number] }))
    : [];

  if (phase !== 'landing' && !leaving) return null;

  /*
   * Into a museum, behind its opening screen.
   *
   * The screen comes up at once — the click is answered in the same frame —
   * and the work it covers runs in parallel where it can: the manifest and
   * the corridor's code together, then the ten paintings for its walls. The
   * corridor is mounted behind the screen as soon as those are in, compiles
   * its materials there and reports the last step itself (CorridorScene), so
   * the screen lifts onto a room that is already drawing rather than one
   * still assembling.
   *
   * The push-through is kept, and shortened: the headline and the list still
   * fly outward past the visitor, now into the opening screen rather than
   * into a corridor that was not ready for them.
   */
  const enter = async (id: string, el: HTMLElement) => {
    if (leaving || loadingId) return;
    const entry = museums.find((m) => m.id === id);
    setError(null);
    setMuseumLoading(id);
    if (entry) useOpening.getState().start(entry);

    if (!reducedMotion && !seenIntro) {
      el.classList.add('is-chosen');
      gsap.to(contentRef.current, { opacity: 0, scale: 1.16, duration: 0.45, ease: 'power2.in' });
      gsap.to(bgRef.current, { scale: 1.08, duration: 0.6, ease: 'power2.inOut' });
    }

    let museum;
    let corridorModule;
    try {
      [museum, corridorModule] = await Promise.all([
        loadMuseum(id),
        import('../scenes/CorridorScene'),
      ]);
    } catch {
      setMuseumLoading(null);
      useOpening.getState().clear();
      el.classList.remove('is-chosen');
      gsap.set([bgRef.current, contentRef.current], { clearProps: 'all' });
      setError('That wing could not be opened. Run `pnpm build:assets` and reload.');
      return;
    }
    // the screen is made of who hangs here, as soon as we know
    useOpening
      .getState()
      .setWords(museum.artworks.map((a) => `${a.artist} — ${a.title} · `).join(''));
    markOpening('plan');

    await corridorModule.preloadWalls(museum.artworks);
    markOpening('walls');
    await whenWritten();

    setMuseum(museum);
    setMuseumLoading(null);
    setLeaving(true);
    setPhase('corridor');
    // the landing layer is behind the screen now; take it down without a show
    gsap.to(rootRef.current, {
      opacity: 0,
      duration: 0.25,
      onComplete: () => {
        setLeaving(false);
        gsap.set([rootRef.current, bgRef.current, contentRef.current], { clearProps: 'all' });
      },
    });
  };

  return (
    <div className={`landing ${leaving ? 'is-leaving' : ''}`} ref={rootRef}>
      <div className="landing-bg" ref={bgRef} aria-hidden>
        {mounted.map(({ work, i }) => (
          <div
            key={work.id}
            className={`landing-img ${i === current ? 'is-active' : ''} ${
              i === prevIndex && i !== current ? 'is-prev' : ''
            }`}
            style={{
              backgroundImage: `url(${imageUrl(work.id, 'view')})`,
              // the work's own focal point, so a tall canvas is not cropped
              // through the face — see scripts/build-all.ts
              backgroundPosition: `${work.focus[0] * 100}% ${work.focus[1] * 100}%`,
              transitionDuration: `${FADE_MS}ms`,
              animationDuration: `${HOLD_MS + FADE_MS}ms`,
            }}
          />
        ))}
      </div>
      <div className="landing-vignette" aria-hidden />
      <div className="landing-scrim" aria-hidden />
      <a className="skip-link" href="#museum-list">
        Skip to the list of museums
      </a>
      <div className="landing-content" ref={contentRef}>
        <h1 className="landing-mark">Placard</h1>
        <p className="landing-line">Read the canvas</p>
        <hr className="hairline" />
        <p className="meta landing-choose">Choose a museum</p>
        <ul className="museum-list" id="museum-list">
          {museums.map((m) => (
            <li key={m.id}>
              <button
                className={`museum-row ${loadingId === m.id ? 'is-loading' : ''}`}
                onClick={(e) => void enter(m.id, e.currentTarget)}
                disabled={!!loadingId}
              >
                <span className="museum-name">{m.name}</span>
                <span className="museum-meta">
                  <span className="caption museum-sub">{m.subtitle}</span>
                  <span className="caption museum-city">
                    {m.city} · {m.count} works
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!museums.length && (
            <li>
              <p className="caption landing-empty">
                No museums found. Run <code>pnpm build:assets</code> and reload.
              </p>
            </li>
          )}
        </ul>
        {error && <p className="caption landing-error">{error}</p>}
        {!stills && (
          <p className={`caption landing-lenshint ${moved ? 'is-gone' : ''}`} aria-hidden>
            Move the cursor across the painting.
          </p>
        )}
        <button className="caption credits-link" onClick={() => setCreditsOpen(true)}>
          Sources &amp; about me
        </button>
      </div>
    </div>
  );
}
