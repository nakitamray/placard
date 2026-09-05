/**
 * The room, heard.
 *
 * A gallery is never silent — there is air moving, a floor, the hum of a
 * building — and a silent one reads as a rendering however good it looks.
 *
 * Two layers do the work. The ambience is real music, streamed from YouTube
 * (see lib/music.ts, which owns the tracks, the crossfades and the credits).
 * Everything that has to land on a particular frame is synthesised here in
 * WebAudio, which costs no bytes, no decode and no request:
 *
 *   the room    a synthesised convolution reverb — 2.6s of stone — that
 *               everything else is played through
 *   room tone   a quiet warm drone plus murmurs built out of formants and
 *               syllables, and footfalls in irregular pairs. This is the
 *               FALLBACK bed: it plays only when the music player cannot be
 *               built, because the alternative is silence
 *   rustle      a short band-passed noise burst — paper, or a lot of small
 *               letters moving at once
 *   swoosh      the wall label arriving
 *   swell       the warp: a rising tone under a noise sweep
 *   chime       a single soft partial when a painting resolves
 *
 * ATTENTION IS A VOLUME CONTROL. `attention()` says how much of the visitor
 * is on the room and how much is on one painting. Walking the corridor is the
 * full room; standing in a gallery is quieter; a painting open in front of you
 * is a bed with nothing arriving in it. Nothing ever cuts — every change is a
 * ramp measured in seconds, in both directions.
 *
 * OFF BY DEFAULT, always. Sound that starts by itself is an ambush, and
 * browsers are right to forbid it: the context is not even created until the
 * visitor asks for it, which also means the autoplay policy is never fought,
 * only obeyed.
 */

import {
  musicUnavailable,
  onMusicUnavailable,
  playMusic,
  resumeMusicOnGesture,
  setMusicDuck,
  stopMusic,
  type RoomKind,
} from './music';

const KEY = 'placard.sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let room: { stop: () => void; id: string; level: AudioParam } | null = null;
let enabled = false;

/**
 * How much of the visitor is on the room: 1 is the corridor, with people in
 * it; lower values are the same room heard from further inside your own head.
 */
const ATTENTION = { room: 1, gallery: 0.62, painting: 0.24 } as const;
export type Attention = keyof typeof ATTENTION;
let attentionLevel: number = ATTENTION.room;

export function soundStored(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

/** one shared buffer of white noise — every noise voice reads from this */
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 2;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

/**
 * Bring the audio graph up. Must be called from inside a user gesture — the
 * toggle does exactly that, which is why the toggle is the only way in.
 */
function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private windows are not an error here */
  }
  if (!on) {
    stopMusic();
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    }
    return;
  }
  const c = ensure();
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setTargetAtTime(1, c.currentTime, 0.4);
}

/*
 * A player that came up paused because the gesture had expired is rescued by
 * the next click anywhere. Cheap, silent when it is not needed, and it turns
 * the common autoplay failure into a one-click one.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => enabled && resumeMusicOnGesture(), {
    passive: true,
  });
}

/* ── the room ───────────────────────────────────────────────────────────── */

/** a stable number in 0..1 from a museum id, so each room sounds like itself */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * The room itself — a convolution reverb, built rather than recorded.
 *
 * This is the single thing that decides whether any of the rest sounds like a
 * museum. A voice or a footstep played dry is a voice or a footstep in your
 * headphones; the same sound through two and a half seconds of stone tail is
 * somebody two rooms away. An impulse response is just a burst of noise that
 * decays, so it can be synthesised: a little silence for the pre-delay, a few
 * discrete early reflections where the walls are, and then an exponentially
 * decaying noise tail, rolled off at the top because stone and plaster eat
 * high frequencies long before they eat low ones.
 */
let irBuf: AudioBuffer | null = null;
function impulse(c: AudioContext): AudioBuffer {
  if (irBuf) return irBuf;
  const dur = 2.6;
  const len = Math.floor(c.sampleRate * dur);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    const preDelay = Math.floor(c.sampleRate * 0.018);
    // early reflections: the first few surfaces, at slightly different times
    // in each ear, which is most of what tells you the room is wide
    const early = [0.021, 0.029, 0.041, 0.058, 0.073].map((t) => ({
      i: Math.floor(c.sampleRate * (t + (ch ? 0.004 : 0))),
      g: 0.5 - t * 3,
    }));
    for (const e of early) if (e.i < len) d[e.i] += e.g * (Math.random() * 2 - 1);
    // the tail
    let lp = 0;
    for (let i = preDelay; i < len; i++) {
      const t = (i - preDelay) / (len - preDelay);
      const decay = Math.pow(1 - t, 2.6);
      // a one-pole low-pass, so the tail darkens as it dies, as a real one does
      lp += ((Math.random() * 2 - 1) - lp) * 0.34;
      d[i] += lp * decay * 0.55;
    }
  }
  irBuf = b;
  return b;
}

/**
 * What a museum actually sounds like.
 *
 * What makes noise into a voice is not its colour but its *rhythm*: a band of
 * noise held open for a second and a half is wind however it is filtered.
 * Speech is syllables — bursts of a tenth of a second with gaps between them —
 * and it lives in formants, two or three narrow resonances stacked in a
 * particular relationship, not in one swept band.
 *
 * So a murmur here is built the way a voice is built: three resonant filters
 * at formant frequencies, driven by noise, opened and shut by a syllabic
 * envelope of five to nine short bursts, at a pitch and pace that vary per
 * utterance — and then thrown into the reverb above, which is what puts it
 * across the hall instead of inside your head. Footsteps are a click and a
 * thump through the same reverb, in irregular pairs, because people walk in
 * pairs of steps and no two are the same length.
 *
 * Nothing is ever intelligible, and that is deliberate: the moment a listener
 * starts making out words, the sound has stopped being a room.
 */
function synthRoomTone(id: string | null, kind: RoomKind = 'gallery') {
  if (!enabled) {
    room?.stop();
    room = null;
    return;
  }
  const key = id === null ? null : `${kind}:${id}`;
  if (room?.id === key) return;
  room?.stop();
  room = null;
  if (!key || !id) return;
  const c = ensure();
  if (!c || !master) return;

  const seed = seedOf(id);
  const now = c.currentTime;
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(master);
  out.gain.setTargetAtTime(attentionLevel, now, 2.4);

  // everything that happens in the room goes through the room
  const verb = c.createConvolver();
  verb.buffer = impulse(c);
  const wet = c.createGain();
  wet.gain.value = kind === 'atlas' || kind === 'entrance' ? 0.9 : 0.62;
  verb.connect(wet).connect(out);
  const dry = c.createGain();
  dry.gain.value = kind === 'atlas' || kind === 'entrance' ? 0.25 : 0.5;
  dry.connect(out);
  /** send a node to both the room and the ear */
  const place = (n: AudioNode) => {
    n.connect(verb);
    n.connect(dry);
  };

  /*
   * The building. In a gallery this is air handling and the note a big stone
   * room gives you for free. In the atlas it is the same idea an octave and a
   * half down and much slower — no walls, no footsteps, nothing arriving:
   * just something very large, very far away, breathing.
   */
  const bare = kind === 'atlas' || kind === 'entrance';
  const base = bare ? 31 + seed * 6 : 48 + seed * 14;
  const partials = bare
    ? [
        { f: base, g: 0.055 },
        { f: base * 1.5, g: 0.03 },
        { f: base * 2.997, g: 0.016 },
        { f: base * 4.02, g: 0.008 },
      ]
    : [
        { f: base, g: 0.028 },
        { f: base * 1.5, g: 0.012 },
        { f: base * 2.01, g: 0.006 },
      ];
  const drone = partials.map(({ f, g }) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    // a very slow drift, so no two partials stay in phase and the bed never
    // settles into a single audible pitch
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.03 + Math.random() * 0.05;
    const amt = c.createGain();
    amt.gain.value = f * 0.004;
    lfo.connect(amt).connect(o.frequency);
    lfo.start();
    const gain = c.createGain();
    gain.gain.value = g;
    o.connect(gain);
    place(gain);
    o.start();
    return [o, lfo];
  });

  let alive = true;
  const timers = new Set<number>();

  /** one scrap of talk, built the way a voice is built */
  const murmur = () => {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;

    // the voice's own pitch region, which is what makes two murmurs sound
    // like two different people
    const pitch = 0.78 + Math.random() * 0.55;
    const formants = [520, 1180, 2500].map((f, i) => {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * pitch * (0.92 + Math.random() * 0.16);
      bp.Q.value = 7 - i * 1.6;
      const g = c.createGain();
      g.gain.value = [1, 0.55, 0.28][i];
      src.connect(bp).connect(g);
      return g;
    });

    // a museum voice has already lost everything above about 2kHz to the room
    const roll = c.createBiquadFilter();
    roll.type = 'lowpass';
    roll.frequency.value = 1900;
    roll.Q.value = 0.7;
    formants.forEach((g) => g.connect(roll));

    // the syllables: short bursts with gaps, which is the whole trick
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    const peak = 0.02 + Math.random() * 0.02;
    let at = t + 0.02;
    const syllables = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < syllables; i++) {
      const len = 0.07 + Math.random() * 0.1;
      const loud = peak * (0.45 + Math.random() * 0.55);
      env.gain.linearRampToValueAtTime(loud, at + len * 0.35);
      env.gain.linearRampToValueAtTime(loud * 0.25, at + len);
      at += len + 0.02 + Math.random() * 0.07;
    }
    env.gain.linearRampToValueAtTime(0, at + 0.12);
    roll.connect(env);

    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.7 - 0.85;
    env.connect(pan);
    place(pan);

    src.start(t);
    src.stop(at + 0.4);
  };

  /** one footfall on stone: the click of the sole, then the weight behind it */
  const step = (when: number, gain: number) => {
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    place(pan);

    const click = c.createBufferSource();
    click.buffer = noise(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400 + Math.random() * 900;
    const cg = c.createGain();
    cg.gain.setValueAtTime(gain * 0.5, when);
    cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
    click.connect(hp).connect(cg).connect(pan);
    click.start(when);
    click.stop(when + 0.06);

    const thump = c.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120 + Math.random() * 40, when);
    thump.frequency.exponentialRampToValueAtTime(58, when + 0.09);
    const tg = c.createGain();
    tg.gain.setValueAtTime(gain, when);
    tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    thump.connect(tg).connect(pan);
    thump.start(when);
    thump.stop(when + 0.16);
  };

  /** people walk in pairs of steps, and no two are the same length */
  const footfalls = () => {
    const t = c.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const pace = 0.46 + Math.random() * 0.2;
    const level = 0.02 + Math.random() * 0.025;
    for (let i = 0; i < n; i++) {
      step(t + i * pace * (0.92 + Math.random() * 0.16), level * (0.7 + Math.random() * 0.5));
    }
  };

  /*
   * Events arrive on their own irregular schedule rather than on a metronome.
   * A fixed interval is audible within about thirty seconds — the ear finds
   * the loop and then cannot stop hearing it — so each one books the next at a
   * fresh random distance.
   */
  const later = (fn: () => void, min: number, max: number) => {
    const t = window.setTimeout(() => {
      if (!alive) return;
      /*
       * Nothing arrives while a painting is open. The bed stays — a room with
       * the people taken out of it is still a room — but a voice or a footstep
       * behind you is an interruption, and this is the one moment the visitor
       * has asked not to be interrupted.
       */
      if (attentionLevel > 0.5) fn();
      later(fn, min, max);
    }, min + Math.random() * (max - min));
    timers.add(t);
  };
  if (kind === 'gallery') {
    later(murmur, 3400, 11000);
    later(footfalls, 9000, 30000);
  }

  room = {
    id: key,
    level: out.gain,
    stop: () => {
      alive = false;
      timers.forEach(window.clearTimeout);
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.7);
      window.setTimeout(() => {
        try {
          drone.flat().forEach((o) => o.stop());
          out.disconnect();
        } catch {
          /* already stopped */
        }
      }, 3000);
    },
  };
}

/* ── what the room actually plays ───────────────────────────────────────── */

/** the room last asked for, so a late player failure knows what to fall back to */
let lastRoom: { id: string; kind: RoomKind } | null = null;

/**
 * Put a room's ambience on: music first, the synthesised bed only if the
 * player cannot be built.
 *
 * Idempotent per room, so App can call it from an effect on every render
 * without restarting anything. `id` is the museum being visited, or 'entrance'
 * or 'atlas'; null is silence.
 */
export function roomTone(id: string | null, kind: RoomKind = 'gallery') {
  lastRoom = enabled && id ? { id, kind } : null;
  if (!enabled || !id) {
    stopMusic();
    synthRoomTone(null);
    return;
  }
  if (musicUnavailable()) {
    synthRoomTone(id, kind);
    return;
  }
  // the synth bed and the music must never run together
  synthRoomTone(null);
  playMusic(`${kind}:${id}`, kind);
}

/**
 * Move the room to one of those levels.
 *
 * A ramp of seconds in both directions, never a cut, and nothing is stopped or
 * restarted: walk away from a painting and the room comes back exactly where
 * it was.
 */
export function attention(where: Attention) {
  const next = ATTENTION[where];
  if (next === attentionLevel) return;
  attentionLevel = next;
  setMusicDuck(next);
  if (room && ctx) {
    room.level.cancelScheduledValues(ctx.currentTime);
    room.level.setTargetAtTime(next, ctx.currentTime, 0.8);
  }
}

/*
 * If the player turns out to be unusable — blocked network, script blocker, a
 * video pulled from YouTube — the synthesised room comes back rather than the
 * page going quiet. Registered once, at module scope, because the failure can
 * arrive seconds after the call that caused it.
 */
onMusicUnavailable(() => {
  if (enabled && lastRoom) synthRoomTone(lastRoom.id, lastRoom.kind);
});

/* ── one-shots ──────────────────────────────────────────────────────────── */

function burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType) {
  if (!enabled) return;
  const c = ensure();
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const now = c.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f).connect(g).connect(master);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function tone(from: number, to: number, dur: number, gain: number) {
  if (!enabled) return;
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.type = 'sine';
  const g = c.createGain();
  const now = c.currentTime;
  o.frequency.setValueAtTime(from, now);
  o.frequency.exponentialRampToValueAtTime(to, now + dur);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.05);
}

/**
 * A swoosh: a band of noise swept across the spectrum under a soft envelope.
 *
 * The wall label needs a sound because it arrives from outside the picture,
 * and it needs a quiet one because it arrives while somebody is looking at
 * something. A sweep upward is a card sliding in; the same sweep downward is
 * the same card leaving, which is why the direction is a parameter rather than
 * two hand-tuned sounds that would never quite match.
 */
function swoosh(from: number, to: number, dur: number, gain: number) {
  if (!enabled) return;
  const c = ensure();
  if (!c || !master) return;
  const now = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(from, now);
  bp.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const pan = c.createStereoPanner();
  pan.pan.value = 0.25;
  src.connect(bp).connect(g).connect(pan).connect(master);
  src.start(now);
  src.stop(now + dur + 0.05);
}

export const sfx = {
  /** a lot of small letters moving at once — a whisper, not a page turn */
  rustle: () => burst(0.5, 3200, 0.9, 0.022, 'bandpass'),
  /** the wall label sliding in, and the same card leaving */
  placardOpen: () => {
    swoosh(400, 2600, 0.42, 0.035);
    tone(392, 588, 0.5, 0.012);
  },
  placardClose: () => swoosh(2200, 380, 0.34, 0.022),
  /** walking through the end wall */
  warp: () => {
    tone(70, 420, 1.3, 0.1);
    burst(1.4, 1200, 0.4, 0.09, 'bandpass');
  },
  /** a painting resolving */
  chime: () => tone(660, 990, 0.7, 0.026),
  /** a connection appearing in the atlas */
  link: () => tone(520, 780, 0.45, 0.032),
};
