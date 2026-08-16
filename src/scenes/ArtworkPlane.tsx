/**
 * ArtworkPlane — the painting surface in the gallery.
 *
 * Active plane samples the shared glyph render target; inactive planes show
 * their static wall.jpg, dimmed (spec §7.4 LOD). The reveal crossfades to the
 * authentic painting (full.jpg, lqip blur-up first). Fidelity path:
 * tone mapping is skipped so the reproduction stays faithful.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glyphRT } from '../glyph/GlyphPrePass';
import type { LoadedArtwork } from '../glyph/artworkLoader';
import { revealAnim } from '../transitions/reveal';

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
varying vec2 vUv;
void main() {
  vec3 live = texture2D(uGlyph, vUv).rgb;
  vec3 wall = texture2D(uWall, vUv).rgb;
  vec3 base = mix(wall, live, uUseGlyph);
  vec3 paint = mix(wall, texture2D(uPaint, vUv).rgb, uHasPaint);
  vec3 color = mix(base, paint, uMix) * uDim;
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
  onTap,
}: {
  artwork: LoadedArtwork | null;
  position: [number, number, number];
  height?: number;
  aspect: number;
  active: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
  onTap?: () => void;
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
    }),
    [],
  );

  useFrame(() => {
    const u = uniforms;
    if (artwork) {
      u.uWall.value = artwork.wallTex;
      const paint = artwork.fullTex ?? artwork.wallTex;
      u.uPaint.value = paint;
      u.uHasPaint.value = 1;
    }
    if (active && glyphRT.current) {
      u.uGlyph.value = glyphRT.current.texture;
      u.uUseGlyph.value = 1;
      u.uMix.value = revealAnim.dissolve;
      u.uDim.value = 1;
    } else {
      u.uUseGlyph.value = 0;
      u.uMix.value = 0;
      u.uDim.value = 0.62; // neighbours read dimmed but legible (spec §10.6)
    }
  });

  // frame: procedural, dark walnut with a gilt inner lip (spec §10.4)
  const frameDepth = 0.09;
  const frameBorder = 0.11;

  return (
    <group position={position}>
      {/* frame */}
      <mesh position={[0, 0, -0.005]} castShadow>
        <boxGeometry args={[width + frameBorder * 2, height + frameBorder * 2, frameDepth]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <boxGeometry args={[width + 0.05, height + 0.05, frameDepth * 0.6]} />
        <meshStandardMaterial color="#C9A227" roughness={0.28} metalness={0.9} />
      </mesh>
      {/* canvas */}
      <mesh
        position={[0, 0, 0.045]}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={onTap}
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
