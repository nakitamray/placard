/** Device tiering — spec §14.2 (renderer string + memory + cores heuristic). */
import type { DeviceTier } from '../types';

export function detectTier(): DeviceTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const coarse = matchMedia('(pointer: coarse)').matches;

  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    }
  } catch {
    /* tiering only */
  }

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
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
