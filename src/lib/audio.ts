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
 *   room tone   a very quiet warm drone — the building — with murmurs and
 *               footfalls scattered over it at unpredictable intervals
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
 * What a gallery actually sounds like.
 *
 * The first version of this was a wide band of noise under a low-pass filter,
 * which is not a room — it is a fan. A gallery is much quieter than that and
 * much less even: a long reverberant space with almost nothing in it, and
 * every few seconds a scrap of somebody talking two rooms away, a footstep on
 * stone, the building itself. What makes it read as a room is the gaps.
 *
 * So there is no continuous noise bed at all. There is a very quiet warm drone
 * — the building, air handling three floors down, the note a big stone room
 * gives you for free — and over it a scatter of *events*: murmurs shaped like
 * distant speech, and the occasional footfall, each one arriving at an
 * unpredictable moment, from an unpredictable direction, and softly enough
 * that you would not notice it if you were not listening for it.
 *
 * A murmur is a band of noise around the frequencies speech carries in,
 * swept slightly and given a slow attack and a long tail, which is what
 * happens to a voice by the time it has been round two marble corners. It is
 * deliberately never intelligible — the moment a listener starts trying to
 * make out words, the sound has stopped being a room and started being
 * content.
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
  out.gain.setTargetAtTime(1, now, 2.2);

  /* the building: three quiet partials, slightly detuned against each other so
     they beat very slowly rather than sitting still */
  const base = 48 + seed * 14;
  const drone = [
    { f: base, g: 0.03 },
    { f: base * 1.5, g: 0.014 },
    { f: base * 2.02, g: 0.007 },
  ].map(({ f, g }) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const gain = c.createGain();
    gain.gain.value = g;
    o.connect(gain).connect(out);
    o.start();
    return o;
  });

  /** one scrap of distant talk */
  const murmur = () => {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;

    // the band a voice survives in once the room has taken the rest away
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 3.2 + Math.random() * 2.5;
    const centre = 380 + Math.random() * 520;
    band.frequency.setValueAtTime(centre, t);
    // a small sweep: speech moves, and a fixed band reads as a whistle
    band.frequency.linearRampToValueAtTime(centre * (0.82 + Math.random() * 0.4), t + 2.4);

    // and then everything above the room's own ceiling is gone
    const roll = c.createBiquadFilter();
    roll.type = 'lowpass';
    roll.frequency.value = 1500;

    const g = c.createGain();
    const dur = 1.4 + Math.random() * 1.9;
    const peak = 0.014 + Math.random() * 0.016;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;

    src.connect(band).connect(roll).connect(g).connect(pan).connect(out);
    src.start(t);
    src.stop(t + dur + 0.1);
  };

  /** somebody crossing a stone floor, a long way off */
  const footfall = () => {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220 + Math.random() * 120;
    const g = c.createGain();
    g.gain.setValueAtTime(0.03 + Math.random() * 0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    src.connect(f).connect(g).connect(pan).connect(out);
    src.start(t);
    src.stop(t + 0.3);
  };

  /*
   * Events arrive on their own irregular schedule rather than on a metronome.
   * A fixed interval is audible within about thirty seconds — the ear finds
   * the loop and then cannot stop hearing it — so each one books the next at a
   * fresh random distance.
   */
  let alive = true;
  const timers = new Set<number>();
  const later = (fn: () => void, min: number, max: number) => {
    const t = window.setTimeout(() => {
      if (!alive) return;
      fn();
      later(fn, min, max);
    }, min + Math.random() * (max - min));
    timers.add(t);
  };
  later(murmur, 2600, 9000);
  later(footfall, 7000, 26000);

  room = {
    id,
    stop: () => {
      alive = false;
      timers.forEach(window.clearTimeout);
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.6);
      window.setTimeout(() => {
        try {
          drone.forEach((o) => o.stop());
          out.disconnect();
        } catch {
          /* already stopped */
        }
      }, 2600);
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
