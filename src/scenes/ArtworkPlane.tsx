/**
 * ArtworkPlane — the painting surface in the gallery.
 *
 * Active plane samples the shared glyph render target; inactive planes show
 * their 512px corridor texture, dimmed (spec §7.4 LOD). The reveal crossfades
 * to the authentic painting. Fidelity path: tone mapping is skipped so the
 * reproduction stays faithful.
 *
 * The reproduction is fetched only once a reveal asks for it, so for the first
 * moment of a reveal there is nothing to cross-fade to yet. `uHasPaint` is
 * that moment: it holds at 0 while the only picture in hand is the 512px
 * texture — which is exactly the blur-up the spec wants, at no extra request —
 * and eases to 1 over a third of a second when the reproduction lands. Without
 * it the painting snaps into focus mid-dissolve on a slow connection.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glyphRT } from '../glyph/GlyphPrePass';
import type { LoadedArtwork } from '../glyph/artworkLoader';
import { revealAnim } from '../transitions/reveal';
import { lens } from '../transitions/lens';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const frag = /* glsl */ `
uniform sampler2D uGlyph;
uniform sampler2D uWall;
uniform sampler2D uPaint;
uniform float uUseGlyph;
uniform float uHasPaint;
uniform float uMix;
uniform float uDim;
uniform vec3  uLens;      // x, y, radius — the artwork's own image pixels
uniform float uLensAmt;
uniform vec2  uImageSize;
varying vec2 vUv;
void main() {
  vec3 live = texture2D(uGlyph, vUv).rgb;
  vec3 wall = texture2D(uWall, vUv).rgb;
  vec3 base = mix(wall, live, uUseGlyph);
  vec3 paint = mix(wall, texture2D(uPaint, vUv).rgb, uHasPaint);
  // The reading lens: the reproduction shows through a soft circle under the
  // cursor. Measured in image pixels, exactly as the glyph shader measures it
  // — in uv the circle would go oval on any canvas that is not square, and
  // the two edges would part company.
  float d = distance(vec2(vUv.x, 1.0 - vUv.y) * uImageSize, uLens.xy);
  float lens = uLensAmt * (1.0 - smoothstep(uLens.z * 0.5, uLens.z, d));
  vec3 color = mix(base, paint, max(uMix, lens)) * uDim;
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export function ArtworkPlane({
  artwork,
  position,
  height = 2.4,
  aspect,
  active,
  onEnter,
  onLeave,
  onMove,
  onTap,
}: {
  artwork: LoadedArtwork | null;
  position: [number, number, number];
  height?: number;
  aspect: number;
  active: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
  /** u,v normalised across the canvas, y-down — image space */
  onMove?: (u: number, v: number) => void;
  onTap?: (u: number, v: number) => void;
}) {
  const width = height * aspect;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uGlyph: { value: null as THREE.Texture | null },
      uWall: { value: null as THREE.Texture | null },
      uPaint: { value: null as THREE.Texture | null },
      uUseGlyph: { value: 0 },
      uHasPaint: { value: 0 },
      uMix: { value: 0 },
      uDim: { value: 1 },
      uLens: { value: new THREE.Vector3(0, 0, 1) },
      uLensAmt: { value: 0 },
      uImageSize: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  useFrame((_, delta) => {
    const u = uniforms;
    if (artwork) {
      u.uWall.value = artwork.wallTex;
      u.uPaint.value = artwork.fullTex ?? artwork.wallTex;
      const want = artwork.fullTex ? 1 : 0;
      const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.35);
      u.uHasPaint.value += (want - u.uHasPaint.value) * k;
    }
    if (active && glyphRT.current) {
      u.uGlyph.value = glyphRT.current.texture;
      u.uUseGlyph.value = 1;
      u.uMix.value = revealAnim.dissolve;
      u.uDim.value = 1;
      u.uImageSize.value.set(artwork?.glyphs.imageW ?? 1, artwork?.glyphs.imageH ?? 1);
      u.uLens.value.set(lens.x, lens.y, lens.r);
      u.uLensAmt.value = lens.amt;
    } else {
      u.uUseGlyph.value = 0;
      u.uMix.value = 0;
      u.uLensAmt.value = 0;
      u.uDim.value = 0.62; // neighbours read dimmed but legible (spec §10.6)
    }
  });

  // The frame is no longer drawn here: the surrounding scene mounts an
  // OrnateFrame around this position, so the plane is only ever the canvas.
  return (
    <group position={position}>
      <mesh
        position={[0, 0, 0]}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onPointerMove={(e) => {
          if (!onMove || !e.uv) return;
          onMove(e.uv.x, 1 - e.uv.y);
        }}
        onClick={(e) => {
          if (!onTap) return;
          onTap(e.uv?.x ?? 0.5, e.uv ? 1 - e.uv.y : 0.5);
        }}
      >
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={vert}
          fragmentShader={frag}
          uniforms={uniforms}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
