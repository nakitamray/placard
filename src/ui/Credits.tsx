/**
 * Credits — spec §15: every corpus source with licence and attribution
 * (required for CC BY-SA compliance), image provenance, plus the projects
 * and references that informed the build.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import type { ArtworkMeta } from '../types';

const REFERENCES: Array<{ name: string; url: string; note: string }> = [
  {
    name: 'chenglou/pretext',
    url: 'https://github.com/chenglou/pretext',
    note: 'Interactive-text experiments that informed the moving-glyph treatment',
  },
  {
    name: 'WICG/view-transitions',
    url: 'https://github.com/WICG/view-transitions',
    note: 'Scene-transition choreography patterns',
  },
  {
    name: 'saadeghi/daisyui',
    url: 'https://github.com/saadeghi/daisyui',
    note: 'Component and design-token conventions referenced for the UI system',
  },
  {
    name: 'GitHub topic: transitions',
    url: 'https://github.com/topics/transitions?o=desc&s=stars',
    note: 'Survey of transition libraries consulted during design',
  },
  {
    name: 'three.js · @react-three/fiber · drei · GSAP · Zustand · Vite · sharp',
    url: 'https://threejs.org',
    note: 'The rendering and build stack this exhibition runs on',
  },
];

export function Credits() {
  const open = useStore((s) => s.creditsOpen);
  const setOpen = useStore((s) => s.setCreditsOpen);
  const artworks = useStore((s) => s.artworks);
  const [metas, setMetas] = useState<ArtworkMeta[]>([]);

  useEffect(() => {
    if (!open || metas.length) return;
    Promise.all(
      artworks.map((a) =>
        fetch(`/artworks/${a.id}/meta.json`).then((r) => r.json() as Promise<ArtworkMeta>),
      ),
    ).then(setMetas);
  }, [open, artworks, metas.length]);

  if (!open) return null;

  return (
    <div className="credits" role="dialog" aria-label="Credits and sources">
      <div className="credits-inner">
        <header className="credits-header">
          <h2 className="display">Credits</h2>
          <button className="caption credits-close" onClick={() => setOpen(false)}>
            Close ✕
          </button>
        </header>

        <section>
          <h3 className="meta credits-section">Corpus sources</h3>
          <p className="body credits-note">
            Every painting on this site is drawn out of text. These are the texts, per artwork,
            with licence and attribution.
          </p>
          {metas.map((m) => (
            <div key={m.id} className="credits-artwork">
              <p className="body credits-title">
                <em>{m.title}</em> — {m.artist}
              </p>
              <ul>
                {m.corpus.sources.map((s) => (
                  <li key={s.id} className="caption credits-source">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}{' '}
                    — {s.attribution} · {s.license}
                  </li>
                ))}
              </ul>
              <p className="caption credits-imgsrc">
                Image: {m.image.source} · {m.image.license}
              </p>
            </div>
          ))}
        </section>

        <section>
          <h3 className="meta credits-section">Placard text</h3>
          <p className="body credits-note">
            Wall labels and extended notes are written for Placard unless credited otherwise;
            medium, dimensions, dates, accession numbers and housing are stated from museum
            collection records. Housing museum: Musée d'Orsay, Paris.
          </p>
        </section>

        <section>
          <h3 className="meta credits-section">Projects &amp; references</h3>
          <ul>
            {REFERENCES.map((r) => (
              <li key={r.name} className="caption credits-source">
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.name}
                </a>{' '}
                — {r.note}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="meta credits-section">Type</h3>
          <p className="caption credits-source">
            Interface: EB Garamond (with serif fallbacks). Glyph canvas: Source Code Pro (with
            monospace fallbacks).
          </p>
        </section>
      </div>
    </div>
  );
}
