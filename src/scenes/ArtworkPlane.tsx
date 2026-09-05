/**
 * ArtworkPlane — the painting surface in the gallery.
 *
 * Active plane samples the shared glyph render target; inactive planes show
 * their 512px corridor texture, dimmed. The reveal crossfades
 * to the authentic painting. Fidelity path: tone mapping is skipped so the
 * reproduction stays faithful.
 *
 * The reproduction is fetched only once a reveal asks for it, so for the first
 * moment of a reveal there is nothing to cross-fade to yet. `uHasPaint` is
 * that moment: it holds at 0 while the only picture in hand is the 512px
 * texture — which is the blur-up, at no extra request —
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
import type { FrameShape } from '../types';

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
uniform float uRound;
uniform float uArch;
varying vec2 vUv;

/*
 * How far outside its own outline a fragment is, in uv.
 *
 * A tondo is cut out of a square canvas and a round-headed panel is cut out of
 * a rectangular one, so in both cases the plane keeps its shape and the shader
 * throws the corners away. Returning a signed distance rather than a boolean
 * is what lets the rim be feathered — a hard cut reads as a jagged staircase
 * against the turned moulding around it.
 */
float outside(vec2 uv) {
  if (uRound > 0.5) return length(uv - 0.5) - 0.5;
  if (uArch > 0.5) {
    // the arch springs where the half-circle of radius 0.5 (in x) begins
    float spring = 1.0 - 0.5 * uArch;
    if (uv.y >= spring) return abs(uv.x - 0.5) - 0.5;
    return length(vec2(uv.x - 0.5, (uv.y - spring) * uArch)) - 0.5;
  }
  return -1.0;
}

void main() {
  float cut = outside(vUv);
  if (cut > 0.0) discard;
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
  float edge = uRound > 0.5 || uArch > 0.5 ? smoothstep(0.0, -0.008, cut) : 1.0;
  gl_FragColor = vec4(color, edge);
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
  shape,
}: {
  artwork: LoadedArtwork | null;
  position: [number, number, number];
  height?: number;
  aspect: number;
  active: boolean;
  /** 'round' cuts the canvas to a circle; a tondo is not a rectangle */
  shape?: FrameShape;
  onEnter?: () => void;
  onLeave?: () => void;
  /** u,v normalised across the canvas, y-down — image space */
  onMove?: (u: number, v: number) => void;
  onTap?: (u: number, v: number) => void;
}) {
  // a tondo is square whatever its scan says, and cut to a circle in the shader
  const width = shape === 'round' ? height : height * aspect;
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
      uRound: { value: 0 },
      uArch: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    const u = uniforms;
    u.uRound.value = shape === 'round' ? 1 : 0;
    /*
     * For an arch the uniform carries the aspect as well as the flag: the head
     * is a half circle of radius half the WIDTH, and the shader works in uv,
     * where that circle is an ellipse unless the y axis is scaled by w/h.
     */
    u.uArch.value = shape === 'arched' ? width / height : 0;
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
      u.uDim.value = 0.62; // neighbours read dimmed but legible
    }
  });

  // The plane is only ever the canvas — the surrounding scene mounts an
  // OrnateFrame around this position.
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
          // only a tondo needs blending, for the feathered rim; a rectangle
          // stays opaque so it keeps writing depth as it always has
          transparent={shape === 'round' || shape === 'arched'}
        />
      </mesh>
    </group>
  );
}
