/**
 * A soft round falloff, built once and shared.
 *
 * Light landing on a surface is the cheapest thing in a room to get wrong. A
 * modelled shaft is volumetric work for a machine that is already drawing
 * seventy thousand letters, and a hard-edged decal reads as a sticker. What
 * actually sells daylight is a warm patch with no edge at all, added rather
 * than painted, lying on the floor where a window would put one — which is a
 * single 128-pixel radial gradient, tinted at the point of use.
 */
import * as THREE from 'three';

let cached: THREE.Texture | null = null;

export function glowTexture(): THREE.Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  cached = new THREE.CanvasTexture(canvas);
  return cached;
}
