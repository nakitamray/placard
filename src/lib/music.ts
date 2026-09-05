/**
 * The music the rooms are played through.
 *
 * Four recordings for the corridors, one for the entrance, one for the atlas,
 * streamed from YouTube through a pair of hidden IFrame players. They are not
 * ours to host: an embedded player is the arrangement the rights holders have
 * agreed to — the view is counted, the uploader is credited in the Colophon,
 * and nothing is copied into this repository.
 *
 * TWO PLAYERS, NOT ONE
 *   One player can hold one video, so moving between rooms with a single
 *   player is a cut. Two decks can overlap: the arriving room fades up while
 *   the room behind you fades down, over a couple of seconds, and the visitor
 *   hears a door rather than a switch.
 *
 * DUCKING
 *   `setMusicDuck` scales whatever is playing without changing what is
 *   playing. Standing in front of a painting drops the room to a bed; walking
 *   away brings it back. Same ramp, no restart.
 *
 * Nothing is built until the visitor turns sound on, which is a gesture, which
 * is what the autoplay policy wants. When the player cannot be built at all —
 * a blocked network, a script blocker, a video pulled from YouTube —
 * `onMusicUnavailable` fires and lib/audio.ts falls back to a synthesised room
 * rather than to silence.
 */

export interface MusicTrack {
  id: string;
  title: string;
  channel: string;
  url: string;
}

/** what plays over the entrance, before a museum has been chosen */
export const ENTRANCE_TRACK: MusicTrack = {
  id: 'IYd1-cPwQCk',
  title: 'Entrance',
  channel: 'YouTube',
  url: 'https://youtu.be/IYd1-cPwQCk',
};

/** the corridor set, shuffled fresh on every entry */
export const MUSEUM_TRACKS: MusicTrack[] = [
  {
    id: 'vHmrbiJ089U',
    title: 'Museum ambience I',
    channel: 'YouTube',
    url: 'https://youtu.be/vHmrbiJ089U',
  },
  {
    id: 'jIaEAqjj-X0',
    title: 'Museum ambience II',
    channel: 'YouTube',
    url: 'https://youtu.be/jIaEAqjj-X0',
  },
  {
    id: 'm16pZKCmgTE',
    title: 'Museum ambience III',
    channel: 'YouTube',
    url: 'https://youtu.be/m16pZKCmgTE',
  },
  {
    id: 'FXpIBT631qc',
    title: 'Museum ambience IV',
    channel: 'YouTube',
    url: 'https://youtu.be/FXpIBT631qc',
  },
];

/** the atlas gets one of them, and gets it quietly */
export const ATLAS_TRACK: MusicTrack = MUSEUM_TRACKS[3];

export type RoomKind = 'entrance' | 'gallery' | 'atlas';

/**
 * 0–100, YouTube's own scale.
 *
 * The entrance sits well under the corridors. It plays over type somebody is
 * reading, before they have chosen anything, and it is the first sound the
 * site makes — the level at which a corridor is atmosphere is the level at
 * which a front door is loud.
 */
const VOLUME: Record<RoomKind, number> = { entrance: 12, gallery: 34, atlas: 9 };

/**
 * How long one room takes to give way to the next.
 *
 * Long. This is a door between two pieces of music, and two seconds of
 * overlap is short enough that the ear hears the join as an edit. Six is the
 * length at which the entrance has genuinely thinned out before the corridor
 * is established, and it is still shorter than the walk in.
 */
const CROSSFADE_MS = 6000;
/** how long a duck takes to settle, either way — slow enough to be a room */
const DUCK_MS = 3200;
/** how long the API script gets before we give up and fall back */
const API_TIMEOUT_MS = 8000;

/* ── the YouTube IFrame API, loaded once and lazily ─────────────────────── */

interface YTPlayer {
  loadPlaylist(opts: { playlist: string[]; index?: number; startSeconds?: number }): void;
  setLoop(on: boolean): void;
  setVolume(v: number): void;
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
}

type YTWindow = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) return resolve(w.YT);

    const timer = window.setTimeout(
      () => reject(new Error('youtube iframe api: timed out')),
      API_TIMEOUT_MS,
    );

    // The API calls one global function when it is ready. Chain rather than
    // clobber: something else on the page may have asked for it too.
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (w.YT?.Player) resolve(w.YT);
      else reject(new Error('youtube iframe api: no player'));
    };

    if (!document.querySelector('script[data-placard-yt]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.dataset.placardYt = '1';
      tag.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('youtube iframe api: blocked'));
      };
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

/* ── decks ──────────────────────────────────────────────────────────────── */

interface Deck {
  slot: 0 | 1;
  player: YTPlayer | null;
  ready: boolean;
  /** what this deck holds, or null when it is free */
  key: string | null;
  /** the level this deck plays at before ducking */
  base: number;
  /** the level it is currently at */
  level: number;
  /** what it is heading for, and the interval taking it there */
  fade: number | null;
  /** the playlist to load once the player reports ready */
  pending: { ids: string[]; base: number } | null;
}

const decks: Deck[] = [0, 1].map((slot) => ({
  slot: slot as 0 | 1,
  player: null,
  ready: false,
  key: null,
  base: 0,
  level: 0,
  fade: null,
  pending: null,
}));

let active: Deck = decks[0];
let unavailable = false;
let onUnavailable: (() => void) | null = null;
/** 0..1, applied on top of every deck's own level */
let duck = 1;

/**
 * Called when the player cannot be used at all. The caller (lib/audio.ts)
 * uses it to fall back to the synthesised room tone rather than to silence.
 */
export function onMusicUnavailable(fn: () => void) {
  onUnavailable = fn;
  if (unavailable) fn();
}

export function musicUnavailable(): boolean {
  return unavailable;
}

function giveUp() {
  if (unavailable) return;
  unavailable = true;
  onUnavailable?.();
}

/** an off-screen host: YouTube will not play into a zero-sized or hidden node */
function host(slot: number): HTMLElement {
  const id = `placard-music-${slot}`;
  const found = document.getElementById(id);
  if (found) return found;
  let box = document.getElementById('placard-music-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'placard-music-box';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText =
      'position:fixed;left:-9999px;top:0;width:320px;height:360px;pointer-events:none;opacity:0;';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.id = id;
  box.appendChild(el);
  return el;
}

function applyLevel(deck: Deck) {
  if (!deck.player || !deck.ready) return;
  try {
    deck.player.setVolume(Math.round(Math.max(0, Math.min(100, deck.level * duck))));
  } catch {
    /* the iframe may already be gone */
  }
}

/**
 * Take a deck to a level over `ms`, in small steps.
 *
 * YouTube's setVolume is a jump, so a fade has to be drawn by hand. Forty
 * milliseconds a step is under the ear's resolution for a level change and
 * costs nothing.
 */
function ramp(deck: Deck, to: number, ms: number, then?: () => void) {
  if (deck.fade !== null) window.clearInterval(deck.fade);
  const from = deck.level;
  if (ms <= 0 || from === to) {
    deck.level = to;
    applyLevel(deck);
    then?.();
    return;
  }
  const started = performance.now();
  deck.fade = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - started) / ms);
    // equal-power, so two decks crossing do not dip in the middle
    deck.level = from + (to - from) * Math.sin((t * Math.PI) / 2) ** 2;
    applyLevel(deck);
    if (t >= 1) {
      window.clearInterval(deck.fade!);
      deck.fade = null;
      then?.();
    }
  }, 40);
}

function build(deck: Deck) {
  if (deck.player || unavailable) return;
  loadApi().then(
    (YT) => {
      if (unavailable) return;
      deck.player = new YT.Player(host(deck.slot), {
        height: '180',
        width: '320',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            deck.ready = true;
            flush(deck);
          },
          // 2 = invalid parameter, 5 = HTML5 error, 100/101/150 = removed or
          // not embeddable. Any of those means this one track is out; skip to
          // the next rather than dropping the whole soundtrack.
          onError: () => {
            try {
              deck.player?.nextVideo();
            } catch {
              giveUp();
            }
          },
          // 0 = ended. setLoop should handle it; this is the belt.
          onStateChange: (e: { data: number }) => {
            if (e.data === 0) deck.player?.playVideo();
          },
        },
      });
    },
    () => giveUp(),
  );
}

/** load whatever this deck was asked for while it was still coming up */
function flush(deck: Deck) {
  if (!deck.player || !deck.ready || !deck.pending) return;
  const { ids, base } = deck.pending;
  deck.pending = null;
  deck.base = base;
  deck.level = 0;
  applyLevel(deck);
  try {
    // start somewhere inside the first track rather than at its head, which is
    // half of "never the same twice"
    deck.player.loadPlaylist({ playlist: ids, index: 0, startSeconds: Math.random() * 90 });
    deck.player.setLoop(true);
    deck.player.playVideo();
  } catch {
    giveUp();
    return;
  }
  ramp(deck, base, CROSSFADE_MS);
}

function stopDeck(deck: Deck, ms: number) {
  const wasKey = deck.key;
  ramp(deck, 0, ms, () => {
    // a deck asked for something new mid-fade keeps it
    if (deck.key !== wasKey) return;
    deck.key = null;
    deck.pending = null;
    try {
      deck.player?.pauseVideo();
    } catch {
      /* the iframe may already be gone */
    }
  });
}

/** shuffle a copy — Fisher–Yates, so every order is equally likely */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tracksFor(kind: RoomKind): string[] {
  if (kind === 'entrance') return [ENTRANCE_TRACK.id];
  if (kind === 'atlas') return [ATLAS_TRACK.id];
  return shuffled(MUSEUM_TRACKS).map((t) => t.id);
}

/**
 * Put a room's music on, fading out whatever the last room was.
 *
 * `key` is what makes this idempotent: called again with the same key it only
 * makes sure the thing is playing, so React re-renders cost nothing. A new key
 * — a different museum, the entrance, the atlas — takes the free deck, starts
 * it at silence and crosses the two over.
 */
export function playMusic(key: string, kind: RoomKind) {
  if (unavailable) return;
  if (active.key === key) {
    // already here; make sure it is at its proper level and running
    if (active.fade === null && active.level !== active.base) ramp(active, active.base, 400);
    resumeMusicOnGesture();
    return;
  }

  const next = decks.find((d) => d !== active) ?? decks[1];
  if (active.key) stopDeck(active, CROSSFADE_MS);
  if (next.fade !== null) {
    window.clearInterval(next.fade);
    next.fade = null;
  }

  next.key = key;
  next.pending = { ids: tracksFor(kind), base: VOLUME[kind] };
  active = next;
  build(next);
  flush(next);
}

export function stopMusic() {
  for (const deck of decks) stopDeck(deck, 700);
  active.key = null;
}

let duckFade: number | null = null;

/**
 * Hold the room back without stopping it.
 *
 * 1 is the room as it plays; lower values are the same room heard from
 * further away. Standing in front of a painting uses this, so the ambience
 * thins to a bed instead of cutting out and back in.
 */
export function setMusicDuck(level: number) {
  const next = Math.max(0, Math.min(1, level));
  if (Math.abs(next - duck) < 0.001) return;
  const from = duck;
  const started = performance.now();
  if (duckFade !== null) window.clearInterval(duckFade);
  duckFade = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - started) / DUCK_MS);
    duck = from + (next - from) * (1 - Math.cos(t * Math.PI)) / 2;
    decks.forEach(applyLevel);
    if (t >= 1) {
      window.clearInterval(duckFade!);
      duckFade = null;
    }
  }, 40);
}

/**
 * Nudge a player the autoplay policy refused.
 *
 * The sound toggle is a gesture, but the player is built asynchronously after
 * it, and by the time it is ready the activation may have expired — in which
 * case YouTube comes up paused and stays that way. Any later click retries it,
 * which costs nothing and rescues the common case.
 */
export function resumeMusicOnGesture() {
  const deck = active;
  if (!deck.player || !deck.ready || !deck.key) return;
  try {
    // 1 = playing, 3 = buffering
    const state = deck.player.getPlayerState();
    if (state !== 1 && state !== 3) deck.player.playVideo();
  } catch {
    /* nothing to do */
  }
}
