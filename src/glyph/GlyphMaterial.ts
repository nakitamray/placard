/**
 * Glyph material — spec §7.2 / §8, adapted from MSDF to mipmapped-alpha atlas.
 *
 * Every per-glyph attribute is uploaded once; animation is driven purely by
 * uniforms (uCharOffset, uBreathe, uDissolve). The character occupying a slot
 * advances through the corpus texture over time — positions never move
 * (spec §4.3: "characters advance, positions do not").
 *
 * The corpus → metrics → palette lookups run in the FRAGMENT stage (the
 * spec sketches them in the vertex shader): per-instance values (slot,
 * colour index) interpolate as constants, and fragment texture fetches are
 * dependable across every driver, including software rasterisers where
 * vertex texture fetch can silently drop the draw.
 *
 * TONE — why each cell carries a colour wash
 * ------------------------------------------
 * A letterform covers only ~20–30% of its cell. Drawing letters alone over a
 * dark ground therefore reproduces the painting at roughly a quarter of its
 * true luminance: every artwork reads as a black canvas with faint text on
 * it. Each glyph instead fills its whole cell with the cell's mean colour at
 * `uWash` opacity and draws the letterform brighter on top. The painting's
 * tonal structure is then correct at a distance, while up close the surface
 * is unmistakably made of moving type.
 */
import * as THREE from 'three';

const vertexShader = /* glsl */ `
precision highp float;

attribute vec2  aQuad;        // unit quad, -0.5..0.5
attribute vec2  aPos;         // glyph centre, image space px
attribute float aSize;
attribute float aRot;
attribute float aColorIndex;
attribute float aSlot;

uniform vec2  uImageSize;
uniform float uBreathe;
uniform vec4  uDetachBox;     // x0,y0,x1,y1 in image px — Thread Pull region
uniform float uDetachAmt;     // 0 = attached, 1 = fully extracted

varying vec2  vQuad;
varying float vSlot;
varying float vColorIndex;
varying float vSeed;
varying float vBreathe;
varying float vInBox;

void main() {
  vQuad = aQuad + 0.5;
  vSlot = aSlot;
  vColorIndex = aColorIndex;
  vSeed = fract(sin(aSlot * 12.9898) * 43758.5453);
  vBreathe = 0.88 + 0.12 * sin(uBreathe + aPos.x * 0.004 + vSeed * 6.28);

  // Thread Pull: is this glyph inside the extracted region?
  vInBox = step(uDetachBox.x, aPos.x) * step(aPos.x, uDetachBox.z) *
           step(uDetachBox.y, aPos.y) * step(aPos.y, uDetachBox.w);

  float c = cos(aRot), s = sin(aRot);
  // extracted glyphs lift slightly off the surface before they fly
  float lift = 1.0 + 0.35 * vInBox * uDetachAmt;
  vec2 local = mat2(c, -s, s, c) * (aQuad * aSize * lift);
  vec2 world = aPos + local;

  // image space is y-down; NDC is y-up (hence the winding note on side:)
  vec2 ndc = ((world / uImageSize) * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uAtlas;
uniform sampler2D uMetrics;
uniform sampler2D uCorpus;
uniform vec2      uCorpusSize;
uniform float     uCorpusLen;
uniform sampler2D uPalette;
uniform float     uPaletteSize;
uniform float     uCharOffset;
uniform float     uCharOffsetFrozen; // extracted glyphs stop advancing
uniform float     uDissolve;
uniform float     uWash;             // cell fill opacity — carries the tone
uniform float     uInkLift;          // how much brighter the letterform is
uniform float     uDetachAmt;

varying vec2  vQuad;
varying float vSlot;
varying float vColorIndex;
varying float vSeed;
varying float vBreathe;
varying float vInBox;

void main() {
  // --- which character occupies this slot right now (spec §4.3) ---
  // glyphs inside an extracted region hold the character they had at the
  // moment of extraction, so the reading text stays stable
  float offset = mix(uCharOffset, uCharOffsetFrozen, vInBox * step(0.001, uDetachAmt));
  float idx = mod(vSlot + offset, uCorpusLen);
  float tcx = mod(idx, uCorpusSize.x);
  float tcy = floor(idx / uCorpusSize.x);
  vec2 cuv = (vec2(tcx, tcy) + 0.5) / uCorpusSize;
  float ch = floor(texture2D(uCorpus, cuv).r * 255.0 + 0.5);

  // --- atlas UV rect for that character (metrics texture, spec §5.1) ---
  vec4 rect = texture2D(uMetrics, vec2((ch + 0.5) / 256.0, 0.5));
  vec2 uv = mix(rect.xy, rect.zw, vec2(vQuad.x, 1.0 - vQuad.y));

  float ink = texture2D(uAtlas, uv).a;
  ink = smoothstep(0.10, 0.62, ink); // firm the mipmapped edge

  // Thread Pull: the letterforms leave while the paint stays. Draining the
  // ink rather than the whole cell means the extracted area holds its exact
  // tone — the region reads as having had its text lifted out of it, not as
  // a rectangular hole punched in the picture.
  ink *= 1.0 - vInBox * uDetachAmt;

  vec3 base = texture2D(uPalette, vec2((vColorIndex + 0.5) / uPaletteSize, 0.5)).rgb;

  // cell wash carries the painting's tone; the letterform rides brighter on
  // top so the surface still reads as type at close range
  float a = uWash + (1.0 - uWash) * ink;
  vec3 color = base * (1.0 + uInkLift * (ink - uWash * 0.5));

  a *= mix(1.0, vBreathe, 0.6);

  // staggered dissolve — each glyph has its own threshold (spec §8.2)
  a *= 1.0 - smoothstep(vSeed - 0.12, vSeed + 0.12, uDissolve);

  if (a < 0.004) discard;
  gl_FragColor = vec4(color, a);
}
`;

export interface GlyphUniforms {
  uAtlas: { value: THREE.Texture };
  uMetrics: { value: THREE.Texture };
  uCorpus: { value: THREE.Texture | null };
  uCorpusSize: { value: THREE.Vector2 };
  uCorpusLen: { value: number };
  uPalette: { value: THREE.Texture | null };
  uPaletteSize: { value: number };
  uCharOffset: { value: number };
  uCharOffsetFrozen: { value: number };
  uImageSize: { value: THREE.Vector2 };
  uDissolve: { value: number };
  uBreathe: { value: number };
  uWash: { value: number };
  uInkLift: { value: number };
  uDetachBox: { value: THREE.Vector4 };
  uDetachAmt: { value: number };
}

export function createGlyphMaterial(
  atlas: THREE.Texture,
  metrics: THREE.Texture,
): THREE.RawShaderMaterial & { uniforms: GlyphUniforms } {
  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uAtlas: { value: atlas },
      uMetrics: { value: metrics },
      uCorpus: { value: null },
      uCorpusSize: { value: new THREE.Vector2(1, 1) },
      uCorpusLen: { value: 1 },
      uPalette: { value: null },
      uPaletteSize: { value: 1 },
      uCharOffset: { value: 0 },
      uCharOffsetFrozen: { value: 0 },
      uImageSize: { value: new THREE.Vector2(1, 1) },
      uDissolve: { value: 0 },
      uBreathe: { value: 0 },
      uWash: { value: 0.74 },
      uInkLift: { value: 0.55 },
      uDetachBox: { value: new THREE.Vector4(0, 0, 0, 0) },
      uDetachAmt: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    // the image-space to NDC y-flip mirrors the quad and reverses its
    // winding; without this, every triangle is back-face culled
    side: THREE.DoubleSide,
  });
  return material as THREE.RawShaderMaterial & { uniforms: GlyphUniforms };
}
