/**
 * Landing — spec §10.1 / §10C.3.
 *
 * The background is the exhibition's own trick, running live: one painting
 * drawn out of its corpus at full bleed (see LandingScene), with the reading
 * lens under the cursor. This layer is the type over the top of it — headline,
 * museum list, and a scrim dark enough to read against.
 *
 * The still-photograph slideshow this page used to carry is still here, and is
 * what `prefers-reduced-motion` gets: a field of several thousand drifting
 * characters is precisely the thing that setting is asking us not to render.
 * Everything below that touches `images`, `current` or `warm` is that path. Choosing a museum fetches its
 * manifest — corridor style, floor plan and works — and then plays T1: the
 * landing layers push outward while the corridor, already rendering behind,
 * dollies in from the mouth (spec §11.1).
 *
 * Only two backgrounds are ever in the DOM: the one showing and the one about
 * to. Mounting all ten and hiding nine behind `opacity: 0` does not stop the
 * browser fetching them — a `background-image` is honoured whatever the
 * element's opacity — so the landing page used to pull ten full-bleed
 * paintings before anyone had chosen anything, on the slowest connection in
 * the visit. It now pulls one, in AVIF or WebP where the browser takes them,
 * and the next arrives during the seconds the first one holds.
 */
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { loadMuseum, useStore } from '../state/store';
import { pointer } from '../state/motion';
import { asset } from '../lib/asset';
import { bestFormat } from '../lib/image';

const HOLD_MS = 7000;
/* Long, and linear. A short crossfade between two full-bleed paintings reads
   as a cut, and easing both layers at once dips the brightness in the middle
   of it. The outgoing slide is held at full opacity underneath while the
   incoming one fades in over it at a constant rate, so there is no dip and no
   moment where the change announces itself. */
const FADE_MS = 2600;

/** what build-all.ts writes to public/landing/manifest.json */
interface LandingManifest {
  files: string[];
  formats: string[];
}

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
  const [images, setImages] = useState<string[]>([]);
  /*
   * The slide showing and the one it came from, moved together in a single
   * update.
   *
   * The outgoing slide used to be remembered in a ref written by an effect
   * after commit, which meant the very next render — and there is always one,
   * because changing slides also resets the preload timer — found the ref
   * already pointing at the new slide and unmounted the old one. The
   * "crossfade" was therefore a fade up from black every time, which is
   * exactly what it looked like. Holding both indices in one piece of state
   * means the pair can never disagree.
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
    void (async () => {
      try {
        const [manifest, format] = await Promise.all([
          fetch(asset('landing/manifest.json')).then((r) => r.json() as Promise<LandingManifest>),
          bestFormat(),
        ]);
        if (!alive) return;
        // the manifest names which formats were actually published, so a build
        // run with PLACARD_SKIP_AVIF=1 does not leave the page asking for them
        const ext = manifest.formats.includes(format) ? format : manifest.formats.at(-1) ?? 'jpg';
        setImages(manifest.files.map((f) => asset(`landing/${f}.${ext}`)));
      } catch {
        if (alive) setImages([]);
      }
    })();
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

  // slideshow (spec §10.1). No explicit preload of the one after next: the
  // next slide is already mounted and fetching, and reaching further ahead is
  // how this page ended up downloading the whole set.
  useEffect(() => {
    if (images.length < 2 || reducedMotion) return;
    const id = setInterval(
      () => setSlide((s) => ({ cur: (s.cur + 1) % images.length, prev: s.cur })),
      HOLD_MS,
    );
    return () => clearInterval(id);
  }, [images, reducedMotion]);

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

  // pointer parallax: background inverse 24px, title direct 6px (spec §10B.3)
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
      ].map((i) => ({ i: i as number, src: images[i as number] }))
    : [];

  if (phase !== 'landing' && !leaving) return null;

  const enter = async (id: string, el: HTMLElement) => {
    if (leaving || loadingId) return;
    setError(null);
    setMuseumLoading(id);
    let museum;
    try {
      museum = await loadMuseum(id);
    } catch {
      setMuseumLoading(null);
      setError('That wing could not be opened. Run `pnpm build:assets` and reload.');
      return;
    }
    setMuseum(museum);
    setMuseumLoading(null);
    setLeaving(true);

    const root = rootRef.current!;
    if (reducedMotion || seenIntro) {
      gsap.to(root, {
        opacity: 0,
        duration: 0.4,
        onComplete: () => {
          setPhase('corridor');
          setLeaving(false);
        },
      });
      return;
    }

    // T1 push-through: landing layers scale outward at differing rates
    // (foreground fastest) while the corridor dollies in behind (spec §11.1)
    el.classList.add('is-chosen');
    const finish = () => {
      setLeaving(false);
      gsap.set([root, bgRef.current, contentRef.current], { clearProps: 'all' });
    };
    // the overlay must come down even if the timeline never reports complete,
    // or a full-screen layer sits over the corridor swallowing every click
    const failsafe = window.setTimeout(finish, 1600);
    const tl = gsap.timeline({
      onComplete: () => {
        window.clearTimeout(failsafe);
        finish();
      },
    });
    tl.to(contentRef.current, { opacity: 0, scale: 1.22, duration: 0.7, ease: 'power2.in' }, 0.15);
    tl.to(bgRef.current, { scale: 1.12, duration: 1.2, ease: 'power2.inOut' }, 0);
    tl.to(root, { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 0.3);
    setPhase('corridor');
  };

  return (
    <div className={`landing ${leaving ? 'is-leaving' : ''}`} ref={rootRef}>
      <div className="landing-bg" ref={bgRef} aria-hidden>
        {mounted.map(({ src, i }) => (
          <div
            key={src}
            className={`landing-img ${i === current ? 'is-active' : ''} ${
              i === prevIndex && i !== current ? 'is-prev' : ''
            }`}
            style={{
              backgroundImage: `url(${src})`,
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
        <p className="landing-mark caption">Placard</p>
        <h1 className="hero">
          Paintings drawn
          <br />
          out of text
        </h1>
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
            Every stroke here is a letter. Move the cursor over the painting.
          </p>
        )}
        <button className="caption credits-link" onClick={() => setCreditsOpen(true)}>
          Credits &amp; sources
        </button>
      </div>
    </div>
  );
}
