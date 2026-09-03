/**
 * The room, heard.
 *
 * A gallery is never silent — there is air moving, a floor, the hum of a
 * building — and a silent one reads as a rendering however good it looks.
 * This is the cheapest thing on the whole site per unit of atmosphere, so it
 * is worth doing carefully and worth doing without a single audio file:
 * everything here is synthesised in WebAudio at run time, which costs no
 * bytes, no decode, and no request.
 *
 *   room tone   filtered noise plus two low partials, detuned per museum, with
 *               a slow LFO on the filter so it breathes rather than drones
 *   rustle      a short band-passed noise burst — paper, or a lot of small
 *               letters moving at once
 *   swell       the warp: a rising tone under a noise sweep
 *   chime       a single soft partial when a painting resolves
 *
 * OFF BY DEFAULT, always. Sound that starts by itself is an ambush, and
 * browsers are right to forbid it: the context is not even created until the
 * visitor asks for it, which also means the autoplay policy is never fought,
 * only obeyed.
 */

const KEY = 'placard.sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let room: { stop: () => void; id: string } | null = null;
let enabled = false;

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

/* ── the room ───────────────────────────────────────────────────────────── */

/** a stable number in 0..1 from a museum id, so each room sounds like itself */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * Start (or swap to) the tone of a room. Idempotent per id, so calling it
 * every render is free; passing null fades the room out.
 */
export function roomTone(id: string | null) {
  if (!enabled) {
    // remember nothing: when sound is off there is no graph to keep in step
    room?.stop();
    room = null;
    return;
  }
  if (room?.id === id) return;
  room?.stop();
  room = null;
  if (!id) return;
  const c = ensure();
  if (!c || !master) return;

  const seed = seedOf(id);
  const now = c.currentTime;
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(master);
  out.gain.setTargetAtTime(0.5, now, 1.6);

  // the air: noise under a low-pass that drifts
  const air = c.createBufferSource();
  air.buffer = noise(c);
  air.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 190 + seed * 150;
  lp.Q.value = 0.6;
  const airGain = c.createGain();
  airGain.gain.value = 0.05;
  air.connect(lp).connect(airGain).connect(out);
  air.start();

  // the drift — a very slow sweep of the filter, so the room breathes
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.045 + seed * 0.03;
  const lfoAmt = c.createGain();
  lfoAmt.gain.value = 70;
  lfo.connect(lfoAmt).connect(lp.frequency);
  lfo.start();

  // two low partials a fifth apart, detuned per room
  const base = 54 + seed * 16;
  const partials = [base, base * 1.5].map((f, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = i === 0 ? 0.05 : 0.022;
    o.connect(g).connect(out);
    o.start();
    return { o, g };
  });

  room = {
    id,
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.5);
      window.setTimeout(() => {
        try {
          air.stop();
          lfo.stop();
          partials.forEach((p) => p.o.stop());
          out.disconnect();
        } catch {
          /* already stopped */
        }
      }, 2000);
    },
  };
}

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

export const sfx = {
  /** a lot of small letters moving at once */
  rustle: () => burst(0.65, 2600, 0.7, 0.075, 'bandpass'),
  /** walking through the end wall */
  warp: () => {
    tone(70, 420, 1.3, 0.1);
    burst(1.4, 1200, 0.4, 0.09, 'bandpass');
  },
  /** a painting resolving */
  chime: () => tone(660, 990, 0.7, 0.035),
  /** a connection appearing in the atlas */
  link: () => tone(520, 780, 0.45, 0.045),
};
