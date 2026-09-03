/**
 * The landing hero — the whole idea, in the first second.
 *
 * The exhibition's one claim is that these paintings are made out of the words
 * written about them, and until now a visitor met that claim four decisions
 * deep: choose a museum, walk a corridor, open the index, choose a work, hover
 * a canvas. By then most of them have gone.
 *
 * So the landing background is not a photograph any more. It is one painting,
 * live, drawn out of its own corpus at full bleed behind the headline, with
 * the reading lens under the cursor — move the mouse and the words give way to
 * paint. Nothing to click, nothing to read first.
 *
 * The work is chosen at random per visit from a set that reads well very
 * large, so the front door is different every time you open it.
 *
 * It reuses the gallery's machinery exactly: the same pre-pass into the same
 * render target, the same shader, the same lens. The only new thing here is a
 * plane sized to cover the viewport.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlyphPrePass, glyphRT } from '../glyph/GlyphPrePass';
import { loadArtwork, loadReveal, type LoadedArtwork } from '../glyph/artworkLoader';
import { lens } from '../transitions/lens';
import { pointer } from '../state/motion';
import { useStore } from '../state/store';
import type { DeviceTier } from '../types';

/**
 * Works that hold up at full bleed: a strong single subject, a composition
 * that survives being cropped to whatever shape the window happens to be, and
 * a corpus with something to say.
 */
const HEROES = [
  'leonardo-mona-lisa',
  'vangogh-starry-night-rhone',
  'hokusai-great-wave',
  'vermeer-lacemaker',
  'renoir-moulin-galette',
  'el-greco-view-toledo',
  'michelangelo-creation-adam',
  'whistler-mother',
];

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const frag = /* glsl */ `
uniform sampler2D uGlyph;
uniform sampler2D uPaint;
uniform float uHasPaint;
uniform float uLensAmt;
uniform vec3  uLens;
uniform vec2  uImageSize;
uniform float uFade;
varying vec2 vUv;
void main() {
  /*
   * The glyph field is rendered onto transparency here rather than onto a
   * flat brown, so the painting can sit UNDER the letters instead of being
   * replaced by them. That is the difference between a mosaic of coloured
   * blocks and a painting you can read: at full bleed the cells are the size
   * of a thumbnail each, and an opaque one is just a pixel.
   *
   * Three.js blends into the target with (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) on
   * the colour channel as well as the alpha, so what comes back is premultiplied
   * — dividing by alpha recovers the letter's own colour.
   */
  vec4 t = texture2D(uGlyph, vUv);
  vec3 text = t.a > 0.004 ? t.rgb / t.a : vec3(0.0);
  vec3 paint = texture2D(uPaint, vUv).rgb;

  // the painting, dimmed, with the text over it
  vec3 under = mix(vec3(0.09, 0.075, 0.062), paint * 0.62, uHasPaint);
  vec3 field = mix(under, text, t.a);

  float d = distance(vec2(vUv.x, 1.0 - vUv.y) * uImageSize, uLens.xy);
  float l = uLensAmt * uHasPaint * (1.0 - smoothstep(uLens.z * 0.5, uLens.z, d));
  vec3 color = mix(field, paint, l);
  gl_FragColor = vec4(color * uFade, 1.0);
  #include <colorspace_fragment>
}
`;

export function LandingScene({ tier }: { tier: DeviceTier }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);
  /** scratch, so the frame loop never allocates */
  const forward = useMemo(() => new THREE.Vector3(), []);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const [art, setArt] = useState<LoadedArtwork | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const fade = useRef(0);

  /*
   * The field is drawn at twice the gallery's resolution where the machine can
   * take it. It is one texture, drawn once per frame, and it is the first
   * thing anybody sees.
   */
  const heroRT = useMemo(() => (tier.name === 'low' ? tier.rtSize : 2048), [tier]);

  // One work per visit, chosen when the component first mounts. `?hero=<id>`
  // pins it, which is how a particular hero gets looked at twice.
  const heroId = useMemo(() => {
    const pinned = new URLSearchParams(window.location.search).get('hero');
    return pinned ?? HEROES[Math.floor(Math.random() * HEROES.length)];
  }, []);

  /*
   * The lens belongs to this page now, so this page has to put it away.
   *
   * It is module state shared with the gallery's own shaders, and this scene
   * drives it open on every frame — so without this it stays open after the
   * landing unmounts, and the first canvas you walk up to has a circle of
   * bare reproduction punched through it at whatever coordinates the hero
   * happened to leave behind.
   */
  useEffect(
    () => () => {
      lens.want = 0;
      lens.amt = 0;
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    void loadArtwork(heroId, tier).then((a) => {
      if (!alive) return;
      setArt(a);
      // the lens has nothing to show until the reproduction is in hand
      void loadReveal(a, 'view');
    });
    return () => {
      alive = false;
    };
  }, [heroId, tier]);

  const uniforms = useMemo(
    () => ({
      uGlyph: { value: null as THREE.Texture | null },
      uPaint: { value: null as THREE.Texture | null },
      uHasPaint: { value: 0 },
      uLens: { value: new THREE.Vector3(0, 0, 1) },
      uLensAmt: { value: 0 },
      uImageSize: { value: new THREE.Vector2(1, 1) },
      uFade: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !art) return;
    const u = uniforms;
    const iw = art.glyphs.imageW;
    const ih = art.glyphs.imageH;

    /*
     * Hold the plane a fixed distance in front of the camera and grow it until
     * it covers the viewport, cropping rather than letterboxing — the CSS
     * `background-size: cover` rule, in world units.
     *
     * The distance and the plane's centre come from the camera's own world
     * direction rather than from an assumed `-Z`, and the visible extent comes
     * from R3F's viewport rather than from tan(fov/2) worked out here: this
     * has to hold whatever the camera happens to be doing, and computing it by
     * hand left a strip of empty render target along the bottom of the screen.
     */
    const dist = 6;
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    mesh.position.copy(camera.position).addScaledVector(forward, dist);
    mesh.quaternion.copy(camera.quaternion);
    const vp = viewport.getCurrentViewport(camera, mesh.position, size);
    const vw = vp.width;
    const vh = vp.height;
    const artAspect = iw / ih;
    const scale = Math.max(vw / artAspect, vh) * 1.06;
    mesh.scale.set(scale * artAspect, scale, 1);

    // testing handle, in the manner of __prepass: says whether the hero is
    // actually covering the viewport without needing a screenshot to guess
    (window as unknown as Record<string, unknown>).__hero = {
      id: art.id,
      vw,
      vh,
      artAspect,
      vpw: vw,
      vph: vh,
      planeW: scale * artAspect,
      planeH: scale,
      cam: [camera.position.x, camera.position.y, camera.position.z],
      fov: camera.fov,
    };

    // the cursor, in the artwork's own pixels: undo the cover fit
    if (!reducedMotion) {
      const planeW = scale * artAspect;
      const planeH = scale;
      const wx = (pointer.x * vw) / 2;
      const wy = (-pointer.y * vh) / 2;
      const uu = wx / planeW + 0.5;
      const vv = 0.5 - wy / planeH;
      lens.x = uu * iw;
      lens.y = vv * ih;
      lens.r = Math.min(iw, ih) * 0.3;
      lens.want = 1;
    }

    if (glyphRT.current) u.uGlyph.value = glyphRT.current.texture;
    u.uPaint.value = art.fullTex ?? art.wallTex;
    u.uImageSize.value.set(iw, ih);
    u.uLens.value.set(lens.x, lens.y, lens.r);
    u.uLensAmt.value = lens.amt;

    const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.4);
    u.uHasPaint.value += ((art.fullTex ? 1 : 0) - u.uHasPaint.value) * k;
    // the field arrives out of the dark rather than snapping on
    fade.current += (1 - fade.current) * (1 - Math.pow(0.001, Math.min(delta, 0.1) / 1.1));
    u.uFade.value = fade.current;
  });

  return (
    <group>
      {/*
        * A bigger render target than a gallery canvas gets, and a much lighter
        * cell wash. This field is stretched over the whole window rather than
        * over a picture frame six metres away, so it is magnified perhaps four
        * times as much — at the gallery's resolution and opacity it reads as a
        * grid of coloured squares rather than as writing.
        */}
      <GlyphPrePass
        artwork={art}
        rtSize={heroRT}
        active={!!art}
        wash={0.34}
        inkLift={0.85}
        clearAlpha={0}
      />
      <mesh ref={meshRef} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={vert}
          fragmentShader={frag}
          uniforms={uniforms}
          toneMapped={false}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
