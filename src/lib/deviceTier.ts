/** Device tiering (renderer string + memory + cores heuristic). */
import type { DeviceTier } from '../types';

/**
 * One throwaway context, asked two questions, then given back.
 *
 * Both questions here — is there a WebGL2 at all, and what GPU is behind it —
 * used to open a context of their own, and neither ever closed one. A browser
 * allows a small fixed number of live WebGL contexts per page (sixteen in
 * Chrome, fewer on mobile), and this exhibition already wants two of them for
 * real: the exhibition canvas and the atlas's. Spending two more on a probe
 * that ran before either existed is how the oldest context on the page gets
 * dropped, which is a corridor that goes black and never comes back.
 *
 * So the probe runs once, keeps only the two strings it came for, and calls
 * `WEBGL_lose_context` on the way out to release the driver resources rather
 * than waiting for a garbage collector that has no idea they are expensive.
 */
interface Probe {
  webgl2: boolean;
  renderer: string;
}

let probed: Probe | null = null;

function probe(): Probe {
  if (probed) return probed;
  const result: Probe = { webgl2: false, renderer: '' };
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      result.webgl2 = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      result.renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* tiering only */
  }
  probed = result;
  return result;
}

export function detectTier(): DeviceTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const coarse = matchMedia('(pointer: coarse)').matches;

  const { renderer } = probe();

  const lowGpu = /Mali|Adreno [1-5]|PowerVR|SwiftShader|llvmpipe/i.test(renderer);

  if (lowGpu || (coarse && (mem <= 4 || cores <= 4))) {
    return { name: 'low', glyphSuffix: '-lo', rtSize: 1024, dprCap: 1.5 };
  }
  if (coarse || mem <= 4 || cores <= 4) {
    return { name: 'mid', glyphSuffix: '-lo', rtSize: 1536, dprCap: 1.5 };
  }
  return { name: 'high', glyphSuffix: '', rtSize: 2048, dprCap: 2 };
}

export function webgl2Supported(): boolean {
  return probe().webgl2;
}
