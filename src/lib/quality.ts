/**
 * What the renderer is allowed to spend.
 *
 * The exhibition has to run for anybody who opens the link, on whatever they
 * happen to be holding. That means the expensive parts — a mirrored floor,
 * shadow maps, carved ornament on every frame, air in the room — are not
 * decisions the scene makes for itself. They are a budget, chosen once from
 * the device and overridable by the visitor.
 *
 * Measured cost of each switch, per frame, in the corridor (1280×720):
 *
 *   reflections   a *second full render of the scene* into a mirror buffer.
 *                 Roughly doubles draw calls on its own — by far the most
 *                 expensive thing here, and the first to go.
 *   shadows       a third scene pass into the shadow map, plus a per-fragment
 *                 lookup. Buys the bars of light on the floor.
 *   ornament      bead courses, cartouches and reeding on every frame. Tens
 *                 of thousands of triangles across a salon wall.
 *   atmosphere    light shafts and dust. Cheap, and the first thing people
 *                 notice, so it survives further down than it deserves to.
 */
import type { DeviceTier } from '../types';

export type QualityName = 'low' | 'mid' | 'high';

export interface Quality {
  name: QualityName;
  /** mirrored floor — the single most expensive feature */
  reflections: boolean;
  /** resolution of the reflection buffer when it is on */
  reflectionRes: number;
  shadows: boolean;
  shadowMapSize: number;
  /** bead courses, cartouches and reeding on frames */
  ornament: boolean;
  /** light shafts and drifting dust */
  atmosphere: boolean;
  /** how many bays ahead get fully detailed frames */
  detailBays: number;
  /** warm wall lamps; each one costs every lit fragment in the room */
  maxLamps: number;
  dprCap: number;
}

const PRESETS: Record<QualityName, Omit<Quality, 'name'>> = {
  low: {
    reflections: false,
    reflectionRes: 256,
    shadows: false,
    shadowMapSize: 512,
    ornament: false,
    atmosphere: false,
    detailBays: 2,
    maxLamps: 2,
    dprCap: 1,
  },
  mid: {
    reflections: false,
    reflectionRes: 512,
    shadows: true,
    shadowMapSize: 1024,
    ornament: true,
    atmosphere: true,
    detailBays: 3,
    maxLamps: 4,
    dprCap: 1.5,
  },
  high: {
    reflections: true,
    reflectionRes: 1024,
    shadows: true,
    shadowMapSize: 2048,
    ornament: true,
    atmosphere: true,
    detailBays: 5,
    maxLamps: 6,
    dprCap: 2,
  },
};

/**
 * What each budget actually is, in words.
 *
 * Three one-syllable labels in the corner of the screen tell a visitor
 * nothing: pressing them changes the picture in ways that are real but not
 * obvious, so they read as a control that does not work. One short line is
 * enough to say which way the trade runs — a full inventory of what each
 * budget turns on is a specification, and nobody hovering a corner of the
 * screen asked for one.
 */
export const QUALITY_INFO: Record<QualityName, { label: string; summary: string }> = {
  low: { label: 'Smooth', summary: 'Easiest on your battery.' },
  mid: { label: 'Balanced', summary: 'The room as intended.' },
  high: { label: 'Rich', summary: 'The most detail. Best plugged in.' },
};

const STORAGE_KEY = 'placard.quality';

/**
 * The visitor's stored choice, if they have made one.
 *
 * Deliberately not defaulted to `high` for everyone: a first visit should be
 * smooth rather than impressive, because a stuttering room reads as broken
 * where a slightly plainer one just reads as a room.
 */
export function storedQuality(): QualityName | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'low' || v === 'mid' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}

export function storeQuality(name: QualityName) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* private windows and blocked storage are not an error here */
  }
}

export function qualityFor(name: QualityName): Quality {
  return { name, ...PRESETS[name] };
}

/**
 * The budget to start with: the visitor's choice, else the device.
 *
 * A desktop that detection has already judged capable starts at `Rich`. The
 * argument for holding it back was that a stuttering room reads as broken —
 * but that risk is already covered from the other end: FrameWatchdog measures
 * real frame times for a few seconds and steps down once if the room is not
 * keeping up. Between a measurement that can correct itself and a guess that
 * costs every desktop visitor the mirrored floor, the measurement should win.
 *
 * Phones and tablets are still held at their detected tier whatever the GPU
 * says, because the thing that stops them is the battery, not the hardware.
 */
export function initialQuality(tier: DeviceTier): Quality {
  const chosen = storedQuality();
  if (chosen) return qualityFor(chosen);
  const desktop =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches &&
    !window.matchMedia('(pointer: coarse)').matches;
  if (tier.name === 'high' && desktop) return qualityFor('high');
  return qualityFor(tier.name === 'high' ? 'mid' : tier.name);
}

/** the next budget down, or null at the bottom */
export function stepDown(name: QualityName): QualityName | null {
  return name === 'high' ? 'mid' : name === 'mid' ? 'low' : null;
}
