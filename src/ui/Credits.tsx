/**
 * The colophon.
 *
 * Every corpus source with its licence and attribution — which is what CC BY-SA
 * requires and, licence aside, simply what an exhibition owes anyone reading
 * it — plus where the pictures came from, what the rooms are played through,
 * why the interface looks like this, how it is built, and a way to write to me.
 *
 * It is staged as a gallery guide rather than a settings panel: a dark spine
 * down the left carrying the sections, the page itself on the right in dark
 * type on bone, because everything on this site you are meant to READ is dark
 * on light and everything you are meant to LOOK AT is light on dark.
 *
 * It opens from the entrance and nowhere else. A licence page belongs at the
 * door of an exhibition, not halfway down a corridor, and reaching it from
 * inside a room only ever raised the question of how to get back to where you
 * were standing.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { asset } from '../lib/asset';
import { imageUrl } from '../lib/image';
import { ATLAS_TRACK, ENTRANCE_TRACK, MUSEUM_TRACKS } from '../lib/music';
import { exhibitionWorks } from '../state/works';
import type { ArtworkMeta } from '../types';

type Tab = 'about' | 'sources' | 'design' | 'technical';

/*
 * About comes first. A colophon that opens on a licence list answers a
 * question nobody at the front door has asked yet; the one they have asked is
 * who made this and why.
 */
const TABS: Array<{ id: Tab; label: string; blurb: string }> = [
  { id: 'about', label: 'About me', blurb: 'Who made it, and how to write' },
  { id: 'sources', label: 'Sources', blurb: 'The texts, the pictures, the museums' },
  { id: 'design', label: 'Design', blurb: 'The idea and the rules it follows' },
  { id: 'technical', label: 'Technical', blurb: 'How a painting is made of text' },
];

/** the exhibition's own colours: umber, gilt, and the tone of a dark room */
const PALETTE = { accent: '#6E5B4A', gilt: '#C9A227', wall: '#2A2119' };

export function Credits() {
  const open = useStore((s) => s.creditsOpen);
  const setOpen = useStore((s) => s.setCreditsOpen);
  const [metas, setMetas] = useState<ArtworkMeta[]>([]);
  const museums = useStore((st) => st.museums);
  const [tab, setTab] = useState<Tab>('about');

  /*
   * Every work in the exhibition, not the room you are standing in — the
   * colophon is opened from the entrance, where no museum has been chosen,
   * and a licence page that lists ten of seventy sources is not a licence page.
   */
  useEffect(() => {
    if (!open || tab !== 'sources' || metas.length) return;
    let alive = true;
    void exhibitionWorks()
      .then((works) =>
        Promise.all(
          works.map((w) =>
            fetch(asset(`artworks/${w.id}/meta.json`)).then((r) => r.json() as Promise<ArtworkMeta>),
          ),
        ),
      )
      .then((all) => alive && setMetas(all))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, tab, metas.length]);

  if (!open) return null;

  const p = PALETTE;
  const skin = {
    '--c-accent': p.accent,
    '--c-gilt': p.gilt,
    '--c-spine': p.wall,
  } as React.CSSProperties;

  return (
    <div className="credits" role="dialog" aria-label="Credits and sources" style={skin}>
      <div className="credits-inner">
        {/* top right, over the page rather than down in the spine: that is
            where a close button is, and it is the first place anyone looks */}
        <button
          className="credits-close"
          onClick={() => setOpen(false)}
          aria-label="Close the colophon"
          title="Close (Esc)"
        >
          <span aria-hidden>✕</span>
        </button>
        <aside className="credits-rail">
          <div className="credits-rail-top">
            <p className="caption credits-rail-mark">Placard</p>
            <h2 className="display credits-rail-title">Colophon</h2>
            <p className="caption credits-rail-where">Seventy works · seven museums</p>
          </div>

          <nav className="credits-nav" role="tablist" aria-label="Colophon sections">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`credits-nav-item ${tab === t.id ? 'is-on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="credits-nav-num caption">{String(i + 1).padStart(2, '0')}</span>
                <span className="credits-nav-text">
                  <span className="credits-nav-label">{t.label}</span>
                  <span className="caption credits-nav-blurb">{t.blurb}</span>
                </span>
              </button>
            ))}
          </nav>

        </aside>

        <div className="credits-scroll">
          {tab === 'sources' && (
            <>
              <section>
                <h3 className="meta credits-section">Corpus sources</h3>
                <p className="body credits-note">
                  Every painting on this site is drawn out of text. These are the texts, per
                  artwork, with licence and attribution.
                </p>
                {!metas.length && <p className="caption credits-source">Loading…</p>}
                <ul className="credits-works">
                  {metas.map((m) => (
                    <li key={m.id} className="credits-work">
                      <img
                        className="credits-work-thumb"
                        src={imageUrl(m.id, 'wall')}
                        alt=""
                        loading="lazy"
                      />
                      <div className="credits-work-body">
                        <p className="body credits-title">
                          <em>{m.title}</em>
                          <span className="credits-work-artist"> — {m.artist}</span>
                        </p>
                        <ul className="credits-work-sources">
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
                          Image: {m.image.url ? (
                            <a href={m.image.url} target="_blank" rel="noreferrer">
                              {m.image.commonsFile.replace(/^File:/, '')}
                            </a>
                          ) : (
                            m.image.source
                          )}{' '}
                          · {m.image.license}
                          {m.image.photoCredit ? ` · ${m.image.photoCredit}` : ''}
                          {m.image.note ? ` · ${m.image.note}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="meta credits-section">The museums</h3>
                <p className="body credits-note">
                  Seven rooms, each modelled on a real one and named after it. Nothing here is
                  affiliated with them; the works are theirs and so is the last word on them.
                  Every corridor title links out to the museum&rsquo;s own site, and so do these.
                </p>
                <ul className="credits-museums">
                  {museums.map((m) => (
                    <li key={m.id} className="credits-museum">
                      <a
                        className="body credits-museum-name"
                        href={m.homepage}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {m.name}
                      </a>
                      <span className="caption credits-museum-where">
                        {m.city} · {m.subtitle} · {m.count} works
                      </span>
                    </li>
                  ))}
                </ul>
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

              <section>
                <h3 className="meta credits-section">Music</h3>
                <p className="body credits-note">
                  The rooms are played through these recordings, streamed from YouTube in an
                  embedded player rather than copied or re-hosted. The entrance has its own
                  piece, the corridors shuffle four between them, and the atlas has one of its
                  own. All credit and all traffic belong to the uploaders.
                </p>
                <ul className="credits-tracks">
                  {[ENTRANCE_TRACK, ...MUSEUM_TRACKS, ATLAS_TRACK].map((t, i, all) => (
                    <li key={t.id} className="caption credits-source">
                      <span className="credits-track-where">
                        {i === 0 ? 'Entrance' : i === all.length - 1 ? 'The atlas' : 'Rooms'}
                      </span>
                      <a href={t.url} target="_blank" rel="noreferrer">
                        {t.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {tab === 'design' && (
            <>
              <section>
                <h3 className="meta credits-section">The idea</h3>
                <p className="body credits-note credits-lede">
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
                <ol className="credits-rules">
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
                  <li className="body">
                    <strong>Sound fades, never cuts.</strong> The room quietens when you stand in
                    front of a painting and comes back when you walk away, on a ramp measured in
                    seconds.
                  </li>
                </ol>
              </section>
              <section>
                <h3 className="meta credits-section">The rooms</h3>
                <p className="body credits-note">
                  Seven corridors, all one procedural machine driven by a different style record:
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
                      Music streamed from two hidden YouTube players so rooms can cross over each
                      other; the chimes, the swoosh, the warp and the fallback room tone
                      synthesised in WebAudio at run time
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
                  The whole exhibition rests on one decision: a painting is never drawn as a
                  picture with letters on top of it. It is drawn <em>as</em> letters, and the
                  picture is what those letters add up to.
                </p>
                <p className="body credits-note">
                  <strong>Offline.</strong> A build step reads the reproduction and subdivides it
                  with a quadtree, splitting a cell whenever the colour variance inside it is
                  over a threshold. Flat sky stays one large cell; an eye becomes a hundred small
                  ones. Each surviving cell becomes one glyph placement — a position, a size, a
                  rotation taken from the local image gradient, and an index into a palette
                  quantised from that painting alone — packed into an eight-byte record. The
                  result is <code>glyphs.bin</code>: typically twenty to forty thousand records,
                  a few hundred kilobytes, and no per-work code anywhere.
                </p>
                <p className="body credits-note">
                  <strong>At run time.</strong> That buffer becomes instance attributes on a
                  single quad, so one painting is one instanced draw call rather than forty
                  thousand. The characters come from a signed-distance-field atlas of the corpus
                  alphabet; which character lands in which slot is computed in the vertex shader
                  from a corpus offset, so advancing every letter on the canvas through the text
                  in reading order costs one uniform update per frame and no CPU work at all.
                </p>
                <p className="body credits-note">
                  <strong>The pre-pass.</strong> The field is rendered into an offscreen target
                  once per frame, and the canvas in the room samples that target as a texture.
                  This is what makes the painting a material rather than a special case: the same
                  quad can be lit, framed, cut to a circle or an arch, hung on a wall at an angle
                  and reflected in a floor, and the words come with it.
                </p>
                <p className="body credits-note">
                  <strong>Three effects, one mechanism.</strong> Every glyph carries a dissolve
                  threshold. Compare it against a global value and you get the reveal; against
                  the distance to the cursor and you get the reading lens; against a rectangle
                  and you get Thread Pull lighting the region a passage belongs to. Nothing is
                  re-uploaded, nothing is rebuilt, and all three can run at once.
                </p>
              </section>

              <section>
                <h3 className="meta credits-section">Where the words come from</h3>
                <p className="body credits-note">
                  A corpus per work, built offline from public-domain and openly licensed writing
                  about that painting — letters, criticism, catalogue entries, the artist&rsquo;s
                  own notes — plus the wall label and extended note written for this exhibition.
                  The build normalises it to the glyph alphabet, records every source with its
                  licence and attribution for the Sources tab, and refuses to build a work whose
                  label is too short to draw from, so a painting can never end up rendered out of
                  filler.
                </p>
              </section>

              <section>
                <h3 className="meta credits-section">The rooms are data</h3>
                <p className="body credits-note">
                  There is one corridor in the code. A museum record names a ceiling kind, a
                  floor kind, a wall treatment, a frame profile, room proportions, a ten-colour
                  palette, a full lighting rig and which fixtures to place, and the renderer
                  builds that. The Louvre&rsquo;s barrel vault and the British Museum&rsquo;s
                  coffered stone lid are two branches of the same component, not two components.
                  Adding a museum is two JSON files and a line in an order file; it touches no
                  rendering code, which is the property the whole data model exists to have.
                </p>
                <p className="body credits-note">
                  Geometry is built once and shared. Frames, mouldings, coffers, piers and
                  balusters are lathed or extruded from a profile at load and merged; anything
                  repeated down a corridor — tiles, panels, stanchions, spot heads — is one
                  instanced mesh with a matrix per copy, so a room of several hundred visible
                  objects is a few dozen draw calls.
                </p>
              </section>

              <section>
                <h3 className="meta credits-section">Choices worth defending</h3>
                <ul className="credits-spec">
                  <li>
                    <span className="caption">Words first</span>
                    <span className="body">
                      A work is shown as its text until you ask for the picture. It is the whole
                      argument of the site, so it is the default state in the store, and the
                      animation that draws it subscribes to that store rather than holding its
                      own copy — the one bug class here is a shader that thinks it is revealed
                      when the interface thinks it is not.
                    </span>
                  </li>
                  <li>
                    <span className="caption">One museum at a time</span>
                    <span className="body">
                      Manifests are per museum and fetched on entry, so visiting the Louvre never
                      costs the download of the Met. The entrance needs to cross all of them, so
                      the build emits one small flat list for it — titles and proportions, no
                      image bytes.
                    </span>
                  </li>
                  <li>
                    <span className="caption">Frame-loop state</span>
                    <span className="body">
                      Anything that changes every frame — camera position along the rail, lens
                      radius, dissolve, thread pull — lives in module-level mutable objects read
                      inside the render loop, never in React state. React draws the room; it does
                      not animate it.
                    </span>
                  </li>
                  <li>
                    <span className="caption">Sound is a room</span>
                    <span className="body">
                      Two hidden players so one recording can cross into another, a duck rather
                      than a cut when you stand in front of a painting, and rooms resumed where
                      they left off. If the player cannot be built at all, a synthesised bed
                      takes over rather than silence.
                    </span>
                  </li>
                  <li>
                    <span className="caption">Checked, not hoped</span>
                    <span className="body">
                      One command validates the whole catalogue offline — floor plans against
                      hangs, works against collections, region boxes, label lengths, scan
                      proportions against the catalogued dimensions, and the atlas graph against
                      what is actually hung — and the image fetcher scores candidate files so a
                      photograph of a frame cannot quietly become the exhibit.
                    </span>
                  </li>
                </ul>
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
                    <span className="body">the corridor, the gallery and the entrance</span>
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
                <p className="body credits-note">
                  The glyph fields are built twice, at full and reduced density, and a phone is
                  served the smaller one; the corridor draws neighbouring works at a fraction of
                  the field it uses in a room; and the reveal, the lens and the thread pull all
                  animate uniforms rather than geometry, so nothing on the critical path
                  reallocates a buffer mid-visit. Everything that moves stops under{' '}
                  <code>prefers-reduced-motion</code>, and every transition has a still frame it
                  is allowed to cut to.
                </p>
              </section>
            </>
          )}

          {tab === 'about' && (
            <>
              <section>
                <h3 className="meta credits-section">About me</h3>
                <p className="body credits-note credits-lede">
                  Hi there! I&rsquo;m Nakita, and I built Placard.
                </p>
                <p className="body credits-note">
                  As a Computer Science major, I build with code, but my greatest inspirations
                  come from a deep love of art and travel. Placard is the bridge between these
                  two worlds.
                </p>
                <p className="body credits-note">
                  I&rsquo;ve always believed that walking into a museum is the purest form of
                  travel. Whether exploring collections in Paris, New York, or Rome, standing
                  before a physical masterpiece has always offered me a connection to understand
                  a culture, a movement, and a moment in time.
                </p>
                <p className="body credits-note">
                  I built Placard to capture the quiet, serene peace of those physical galleries
                  and bring it into the digital space. This project isn&rsquo;t designed to
                  replace the gallery wall, but rather to serve as an immersive preview. By
                  bridging code and curatorial history, my hope is to give you a glimpse of that
                  beauty on your screen, and ultimately inspire you to step away from the
                  computer, pack a bag, and experience these masterworks in person.
                </p>
                <p className="caption credits-signed">— Nakita Ray</p>
                <ul className="credits-links">
                  <li className="caption credits-source">
                    <a
                      href="https://github.com/nakitamray/placard"
                      target="_blank"
                      rel="noreferrer"
                    >
                      The source on GitHub
                    </a>
                  </li>
                </ul>
              </section>
              <ContactForm />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── write to me ────────────────────────────────────────────────────────── */

/**
 * The contact form.
 *
 * The address itself is never shown — see CONTACT_EMAIL below. Two ways it
 * can deliver, and it picks whichever is configured:
 *
 *   1. An HTTP endpoint in `VITE_CONTACT_ENDPOINT` — a Formspree / Getform /
 *      Basin form URL, or a serverless function of your own. The message is
 *      POSTed as JSON and the visitor never leaves the exhibition.
 *   2. Nothing configured: the form composes a `mailto:` and hands it to the
 *      visitor's own mail client, addressed to `VITE_CONTACT_EMAIL`.
 *
 * (2) is the default because it works the moment this ships, with no account
 * anywhere and no third party in the middle. Set the endpoint when you want
 * messages to arrive without the visitor having a mail client set up.
 *
 * The form is deliberately three fields. Every extra one costs replies.
 */
const CONTACT_ENDPOINT = (import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined) ?? '';
/*
 * Never rendered. A mail address printed on a public page is scraped within
 * days, so this is only ever used as the target of a mailto: the browser
 * hands to the visitor's own mail client — where they see it, and no crawler
 * does. Nothing in the interface says what it is, including the errors.
 */
const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? 'nakitamray@gmail.com';

function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (!CONTACT_ENDPOINT) {
      const subject = `Placard — a note from ${name.trim() || 'a visitor'}`;
      const body = `${message}\n\n— ${name.trim() || 'anonymous'}${
        email.trim() ? ` <${email.trim()}>` : ''
      }`;
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`;
      setState('sent');
      return;
    }

    setState('sending');
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setState('failed');
    }
  };

  return (
    /* The one dark panel on a bone page. Everything above it is a document to
       be read; this is a thing to be used, and it is easier to use — and much
       easier on the eyes at the bottom of a long white scroll — set in the
       exhibition's own colours instead of the paper's. */
    <section className="credits-contact">
      <h3 className="meta credits-section credits-contact-head">Write to me</h3>
      {state === 'sent' ? (
        <p className="body credits-note">
          {CONTACT_ENDPOINT
            ? 'Thank you — it arrived. I read everything.'
            : 'Your mail client should be opening with the message in it, ready to send.'}
          <br />
          <button className="caption contact-again" onClick={() => setState('idle')}>
            Write another →
          </button>
        </p>
      ) : (
        <>
          <p className="body credits-note">
            Something you liked, something that broke, a painting that should be here — write it
            down and I will get it.
          </p>
          <form className="contact" onSubmit={submit}>
            <label className="contact-field">
              <span className="caption">Your name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="contact-field">
              <span className="caption">Your email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="so I can reply"
              />
            </label>
            <label className="contact-field">
              <span className="caption">Message</span>
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </label>
            <div className="contact-foot">
              <button
                type="submit"
                className="caption contact-send"
                disabled={state === 'sending' || !message.trim()}
              >
                {state === 'sending' ? 'Sending…' : 'Send'}
              </button>
              {state === 'failed' && (
                <span className="caption contact-error">
                  That did not go through. Try again in a moment?
                </span>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
