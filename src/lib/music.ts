/**
 * The music the rooms are played through.
 *
 * Everything else that makes a noise on this site is synthesised (see
 * lib/audio.ts) — which costs no bytes and no requests, and which sounded,
 * in the end, like a synthesiser. So the ambience is now four pieces of real
 * music, played from YouTube through a hidden IFrame player.
 *
 * WHY A HIDDEN YOUTUBE PLAYER RATHER THAN AUDIO FILES
 *   These recordings are not ours to host. Streaming them from YouTube in an
 *   embedded player is the arrangement the rights holders have actually agreed
 *   to: the view is counted, the channel is credited (see the Colophon), and
 *   nothing is copied into this repository. It also means no megabytes of
 *   audio in the bundle.
 *
 * WHAT PLAYS WHERE
 *   the museums   all four, shuffled fresh on every entry, each starting at a
 *                 random point in the first track — so walking into a corridor
 *                 twice never sounds the same twice
 *   the atlas     one piece, quiet: it is a room with no walls in it and the
 *                 music should be a long way off
 *
 * WHEN IT CANNOT PLAY
 *   Blocked networks, a script blocker, a video pulled from YouTube: all of
 *   these are ordinary, and none of them should mean silence. `onUnavailable`
 *   fires and lib/audio.ts falls back to the synthesised room tone it has
 *   always had.
 *
 * The player is never built until the visitor turns sound on, which is a
 * gesture, which is what the autoplay policy wants.
 */

export interface MusicTrack {
  id: string;
  title: string;
  channel: string;
  url: string;
}

/**
 * The corridor set. Credited in the Colophon under "Music", which is a
 * condition of using them and also simply the right thing to do.
 */
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

/** 0–100, YouTube's own scale. The atlas is deliberately far down it. */
const VOLUME = { gallery: 42, atlas: 11 };

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
  Player: new (
    el: HTMLElement | string,
    opts: Record<string, unknown>,
  ) => YTPlayer;
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

/* ── the player ─────────────────────────────────────────────────────────── */

let player: YTPlayer | null = null;
let playerReady = false;
let unavailable = false;
let onUnavailable: (() => void) | null = null;

/** what we would be playing if the player were ready — applied on ready */
let want: { key: string; ids: string[]; volume: number } | null = null;
/** what is actually loaded, so a repeat call is not a restart */
let current: string | null = null;

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
function host(): HTMLElement {
  let el = document.getElementById('placard-music');
  if (el) return el;
  const box = document.createElement('div');
  box.id = 'placard-music-box';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:fixed;left:-9999px;top:0;width:320px;height:180px;pointer-events:none;opacity:0;';
  el = document.createElement('div');
  el.id = 'placard-music';
  box.appendChild(el);
  document.body.appendChild(box);
  return el;
}

function apply() {
  if (!player || !playerReady || !want) return;
  if (current === want.key) {
    player.setVolume(want.volume);
    player.playVideo();
    return;
  }
  current = want.key;
  player.setVolume(want.volume);
  // start somewhere inside the first track rather than at its head, which is
  // the other half of "not the same twice"
  player.loadPlaylist({ playlist: want.ids, index: 0, startSeconds: Math.random() * 90 });
  player.setLoop(true);
  player.playVideo();
}

function ensurePlayer() {
  if (player || unavailable) return;
  loadApi().then(
    (YT) => {
      if (unavailable) return;
      player = new YT.Player(host(), {
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
            playerReady = true;
            apply();
          },
          // 2 = invalid parameter, 5 = HTML5 error, 100/101/150 = removed or
          // not embeddable. Any of those means this one track is out; skip to
          // the next rather than dropping the whole soundtrack.
          onError: () => {
            try {
              player?.nextVideo();
            } catch {
              giveUp();
            }
          },
          onStateChange: (e: { data: number }) => {
            // 0 = ended. setLoop should handle it; this is the belt.
            if (e.data === 0) player?.playVideo();
          },
        },
      });
    },
    () => giveUp(),
  );
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

/**
 * Put a room's music on.
 *
 * `key` is what makes this idempotent: called again with the same key it only
 * makes sure the thing is playing, so React re-renders cost nothing. A new key
 * — a different museum, or the atlas — reshuffles and starts again.
 */
export function playMusic(key: string, kind: 'gallery' | 'atlas') {
  if (unavailable) return;
  want = {
    key,
    ids: kind === 'atlas' ? [ATLAS_TRACK.id] : shuffled(MUSEUM_TRACKS).map((t) => t.id),
    volume: VOLUME[kind],
  };
  ensurePlayer();
  apply();
}

export function stopMusic() {
  want = null;
  current = null;
  if (player && playerReady) {
    try {
      player.pauseVideo();
    } catch {
      /* the iframe may already be gone */
    }
  }
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
  if (!player || !playerReady || !want) return;
  try {
    // 1 = playing, 3 = buffering
    const state = player.getPlayerState();
    if (state !== 1 && state !== 3) player.playVideo();
  } catch {
    /* nothing to do */
  }
}
