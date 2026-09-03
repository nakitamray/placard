/**
 * Credits — spec §15: every corpus source with licence and attribution
 * (required for CC BY-SA compliance), image provenance, plus the projects
 * and references that informed the build.
 */
import { useEffect, useState } from 'react';
import { selectArtworks, useStore } from '../state/store';
import { asset } from '../lib/asset';
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

type Tab = 'sources' | 'design' | 'technical' | 'about';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sources', label: 'Sources' },
  { id: 'design', label: 'Design' },
  { id: 'technical', label: 'Technical' },
  { id: 'about', label: 'About' },
];

export function Credits() {
  const open = useStore((s) => s.creditsOpen);
  const setOpen = useStore((s) => s.setCreditsOpen);
  const artworks = useStore(selectArtworks);
  const [metas, setMetas] = useState<ArtworkMeta[]>([]);
  const [tab, setTab] = useState<Tab>('sources');

  useEffect(() => {
    if (!open || tab !== 'sources' || metas.length) return;
    Promise.all(
      artworks.map((a) =>
        fetch(asset(`artworks/${a.id}/meta.json`)).then((r) => r.json() as Promise<ArtworkMeta>),
      ),
    ).then(setMetas);
  }, [open, tab, artworks, metas.length]);

  if (!open) return null;

  return (
    <div className="credits" role="dialog" aria-label="Credits and sources">
      <div className="credits-inner">
        <div className="credits-scroll">
          <header className="credits-header">
            <h2 className="display">Colophon</h2>
            <button className="caption credits-close" onClick={() => setOpen(false)}>
              Close ✕
            </button>
          </header>

          <div className="credits-tabs caption" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'is-on' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'sources' && (
            <>
              <section>
                <h3 className="meta credits-section">Corpus sources</h3>
                <p className="body credits-note">
                  Every painting on this site is drawn out of text. These are the texts, per
                  artwork, with licence and attribution.
                </p>
                {!metas.length && (
                  <p className="caption credits-source">
                    Enter a museum and reopen this panel to see the texts behind its works.
                  </p>
                )}
                {metas.map((m) => (
                  <div key={m.id} className="credits-artwork">
                    <p className="body credits-title">
                      <em>{m.title}</em> — {m.artist}
                    </p>
                    <ul>
                      {m.corpus.sources.map((src) => (
                        <li key={src.id} className="caption credits-source">
                          {src.url ? (
                            <a href={src.url} target="_blank" rel="noreferrer">
                              {src.title}
                            </a>
                          ) : (
                            src.title
                          )}{' '}
                          — {src.attribution} · {src.license}
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
                  Wall labels and extended notes are written for Placard unless credited
                  otherwise; medium, dimensions, dates, accession numbers and housing are stated
                  from museum collection records.
                </p>
              </section>

              <section>
                <h3 className="meta credits-section">Pictures</h3>
                <p className="body credits-note">
                  Every reproduction is fetched from Wikimedia Commons, at the size it is used,
                  with the licence Commons states recorded per work. All the originals are old
                  enough to be in the public domain; the photographs of them are PD-Art.
                </p>
              </section>
            </>
          )}

          {tab === 'design' && (
            <>
              <section>
                <h3 className="meta credits-section">The idea</h3>
                <p className="body credits-note">
                  A painting is the thing everyone has already seen. What nobody sees is the
                  weight of writing behind it — the letters, the reviews, the catalogue entries,
                  the arguments. So the paintings here are literally built out of that writing:
                  every stroke is a character from a text about that work, moving through the
                  corpus in reading order. Hold the cursor still and the picture resolves; press
                  space and you can pull a passage back out of the part of the canvas it belongs
                  to.
                </p>
              </section>
              <section>
                <h3 className="meta credits-section">Rules the interface follows</h3>
                <ul className="credits-rules">
                  <li className="body">
                    <strong>The interface is the quiet frame around a loud idea.</strong> One
                    serif, one accent, no colour that is not already in the room. Nothing is
                    labelled that the architecture can say by itself.
                  </li>
                  <li className="body">
                    <strong>Every panel is a veil, never a card.</strong> Overlays are frosted
                    glass with feathered edges, so they take their colour from the painting
                    behind them instead of cutting a hole in it.
                  </li>
                  <li className="body">
                    <strong>The same control is always in the same place.</strong> The way out is
                    top left and the room&rsquo;s name is top right, in the corridor, the gallery,
                    the floor plan and the atlas alike.
                  </li>
                  <li className="body">
                    <strong>Hover looks, click decides.</strong> Moving over a canvas shows the
                    painting; only a click keeps it open and brings the wall label.
                  </li>
                  <li className="body">
                    <strong>Nothing announces itself twice.</strong> The control hints start
                    legible and settle to a whisper after the first input.
                  </li>
                  <li className="body">
                    <strong>Motion is a room, not an effect.</strong> Every transition is a move
                    through architecture — down a corridor, through an end wall, into a bay — and
                    all of it stops under <code>prefers-reduced-motion</code>.
                  </li>
                </ul>
              </section>
              <section>
                <h3 className="meta credits-section">The rooms</h3>
                <p className="body credits-note">
                  Five corridors, all one procedural machine driven by a different style record:
                  ceiling, floor, wall treatment, frame profile, palette and the whole lighting
                  rig come from data. Adding a museum is a JSON file, not a rendering change. The
                  buildings are modelled on the real ones — the Louvre&rsquo;s barrel vault, the
                  Orsay&rsquo;s train-shed roof, the Met&rsquo;s glazed court between a marble
                  wall and a brick one.
                </p>
              </section>
            </>
          )}

          {tab === 'technical' && (
            <>
              <section>
                <h3 className="meta credits-section">Stack</h3>
                <ul className="credits-spec">
                  <li>
                    <span className="caption">Language</span>
                    <span className="body">TypeScript, strict</span>
                  </li>
                  <li>
                    <span className="caption">Interface</span>
                    <span className="body">React 18, Zustand for state, GSAP for choreography</span>
                  </li>
                  <li>
                    <span className="caption">Rendering</span>
                    <span className="body">
                      three.js via react-three-fiber, with hand-written GLSL for the glyph field
                    </span>
                  </li>
                  <li>
                    <span className="caption">Sound</span>
                    <span className="body">
                      WebAudio, synthesised at run time — no audio files at all
                    </span>
                  </li>
                  <li>
                    <span className="caption">Build</span>
                    <span className="body">Vite, pnpm, sharp for the image pipeline</span>
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="meta credits-section">How a painting is made of text</h3>
                <p className="body credits-note">
                  Offline, each work is reduced to a field of glyph placements: a position, a
                  size, a rotation and a palette index per character, packed into an eight-byte
                  record in <code>glyphs.bin</code>. At run time that becomes one instanced draw
                  call of a single quad — twenty thousand letters for one draw — rendered in a
                  pre-pass into an offscreen target that the canvas then samples as a texture.
                  Which character sits in a slot is decided in the shader by an offset into the
                  corpus, so the whole field advances through the text by changing one uniform.
                </p>
                <p className="body credits-note">
                  The reveal, the reading lens and Thread Pull are all the same mechanism seen
                  three ways: a per-glyph dissolve threshold, compared against a global value, a
                  radius around the cursor, or a rectangle around a semantic region.
                </p>
              </section>

              <section>
                <h3 className="meta credits-section">Structure</h3>
                <ul className="credits-spec">
                  <li>
                    <span className="caption">data/</span>
                    <span className="body">
                      authored records — museums, collections, corpora, the atlas graph
                    </span>
                  </li>
                  <li>
                    <span className="caption">scripts/</span>
                    <span className="body">
                      the asset pipeline: fetch from Commons, build images, corpora and glyphs
                    </span>
                  </li>
                  <li>
                    <span className="caption">src/scenes/</span>
                    <span className="body">the corridor, the gallery and the landing hero</span>
                  </li>
                  <li>
                    <span className="caption">src/glyph/</span>
                    <span className="body">the glyph atlas, the shader and the pre-pass</span>
                  </li>
                  <li>
                    <span className="caption">src/ui/</span>
                    <span className="body">everything in the DOM over the canvas</span>
                  </li>
                  <li>
                    <span className="caption">src/state/</span>
                    <span className="body">
                      one store for what the room is doing, one for the atlas
                    </span>
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="meta credits-section">Performance</h3>
                <p className="body credits-note">
                  Three rendering budgets, chosen from the device and overridable by the visitor,
                  with a watchdog that measures real frame times for a few seconds and steps down
                  once if the room is not keeping up. Pictures are published in three sizes and
                  three formats, and the browser is handed the smallest one it can decode —
                  probed with a two-pixel image rather than sniffed from the user agent.
                </p>
              </section>
            </>
          )}

          {tab === 'about' && (
            <section>
              <h3 className="meta credits-section">About</h3>
              {/*
                Nakita: replace the two paragraphs below with your own bio and
                links. Nothing else on this tab needs touching.
              */}
              <p className="body credits-note">
                Placard is made by <strong>Nakita Mray</strong>.
              </p>
              <p className="body credits-note credits-bio">
                [Your bio goes here — a few sentences: what you do, what drew you to putting
                paintings back together out of the writing about them, and anything you want a
                visitor to know.]
              </p>
              <ul className="credits-links">
                <li className="caption credits-source">
                  <a href="https://github.com/nakitamray/placard" target="_blank" rel="noreferrer">
                    The source on GitHub
                  </a>
                </li>
              </ul>
            </section>
          )}

          <section>
            <h3 className="meta credits-section">Type</h3>
            <p className="caption credits-source">
              Interface: EB Garamond (with serif fallbacks). Glyph canvas: Source Code Pro (with
              monospace fallbacks).
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
        </div>
      </div>
    </div>
  );
}
