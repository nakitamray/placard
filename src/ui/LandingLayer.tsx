/**
 * Landing — spec §10.1 / §10C.3.
 *
 * Full-bleed painting backgrounds with a slow Ken Burns crossfade, dark
 * vignette, left-aligned gallery selector. T1: the selector becomes a
 * clip-path aperture and the landing pushes through into the corridor
 * already rendering behind it (spec §11.1).
 */
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useStore } from '../state/store';
import { pointer } from '../state/motion';

const HOLD_MS = 6000;
const FADE_MS = 1200;

export function LandingLayer() {
  const phase = useStore((s) => s.phase);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const seenIntro = useStore((s) => s.seenIntro);
  const setPhase = useStore((s) => s.setPhase);
  const setCreditsOpen = useStore((s) => s.setCreditsOpen);

  const [images, setImages] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/landing/manifest.json')
      .then((r) => r.json())
      .then((files: string[]) => setImages(files.map((f) => `/landing/${f}`)))
      .catch(() => setImages([]));
  }, []);

  // slideshow with next-image preload (spec §10.1)
  useEffect(() => {
    if (images.length < 2 || reducedMotion) return;
    const id = setInterval(() => {
      setCurrent((c) => {
        const next = (c + 1) % images.length;
        const pre = new Image();
        pre.src = images[(next + 1) % images.length];
        return next;
      });
    }, HOLD_MS);
    return () => clearInterval(id);
  }, [images, reducedMotion]);

  // pointer parallax: background inverse 24px, title direct 6px (spec §10B.3)
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const cur = { bx: 0, by: 0, tx: 0 };
    const tick = () => {
      cur.bx += (pointer.x * -24 - cur.bx) * 0.06;
      cur.by += (pointer.y * -24 - cur.by) * 0.06;
      cur.tx += (pointer.x * 6 - cur.tx) * 0.06;
      if (bgRef.current) bgRef.current.style.transform = `translate(${cur.bx}px, ${cur.by}px)`;
      if (contentRef.current)
        contentRef.current.style.transform = `translate(${cur.tx}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  if (phase !== 'landing' && !leaving) return null;

  const enterGallery = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (leaving) return;
    setLeaving(true);
    const root = rootRef.current!;
    const short = reducedMotion || seenIntro;
    if (short) {
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
    // (foreground fastest) while the corridor, already rendering behind,
    // dollies in from the mouth (spec §11.1)
    e.currentTarget.classList.add('is-chosen');
    const tl = gsap.timeline({
      onComplete: () => {
        setLeaving(false);
        gsap.set([root, bgRef.current, contentRef.current], { clearProps: 'all' });
      },
    });
    tl.to(contentRef.current, { opacity: 0, scale: 1.22, duration: 0.7, ease: 'power2.in' }, 0.15);
    tl.to(bgRef.current, { scale: 1.12, duration: 1.2, ease: 'power2.inOut' }, 0);
    tl.to(root, { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 0.3);
    setPhase('corridor'); // corridor starts its mouth dolly behind the fade
  };

  return (
    <div className="landing" ref={rootRef}>
      <div className="landing-bg" ref={bgRef} aria-hidden>
        {images.map((src, i) => (
          <div
            key={src}
            className={`landing-img ${i === current ? 'is-active' : ''}`}
            style={{
              backgroundImage: `url(${src})`,
              transitionDuration: `${FADE_MS}ms`,
              animationDuration: `${HOLD_MS + FADE_MS}ms`,
            }}
          />
        ))}
      </div>
      <div className="landing-vignette" aria-hidden />
      <a className="skip-link" href="#gallery-list">
        Skip to gallery list
      </a>
      <div className="landing-content" ref={contentRef}>
        <p className="landing-mark caption">Placard</p>
        <h1 className="hero">
          Where history paints
          <br />
          the masterpiece
        </h1>
        <hr className="hairline" />
        <p className="meta landing-choose">Choose a gallery</p>
        <ul className="gallery-list" id="gallery-list">
          <li>
            <button className="gallery-row" onClick={enterGallery}>
              <span className="gallery-name">Musée d'Orsay</span>
              <span className="caption gallery-city">Paris</span>
            </button>
          </li>
          <li>
            <div className="gallery-row is-disabled" aria-disabled>
              <span className="gallery-name">The Met</span>
              <span className="caption gallery-city">(soon)</span>
            </div>
          </li>
          <li>
            <div className="gallery-row is-disabled" aria-disabled>
              <span className="gallery-name">Rijksmuseum</span>
              <span className="caption gallery-city">(soon)</span>
            </div>
          </li>
        </ul>
        <button className="caption credits-link" onClick={() => setCreditsOpen(true)}>
          Credits &amp; sources
        </button>
      </div>
    </div>
  );
}
