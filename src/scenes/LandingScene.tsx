/**
 * The landing hero — the whole idea, in the first second.
 *
 * The exhibition's one claim is that these paintings are made out of the words
 * written about them, and until now a visitor met that claim four decisions
 * deep: choose a museum, walk a corridor, open the index, choose a work, hover
 * a canvas. By then most of them have gone.
 *
 * So the landing background is not a photograph any more. It is a painting,
 * live, drawn out of its own corpus at full bleed behind the headline, with
 * the reading lens under the cursor — move the mouse and the words give way to
 * paint, and the picture leans very slightly toward you as you go.
 *
 * IT CHANGES. Every fifteen seconds it crossfades to another work, which is
 * why there are two of everything here: two glyph pre-passes writing into two
 * render targets, two planes, and an opacity ramp between them. The single
 * shared render target the gallery uses can only hold one field at a time, so
 * a crossfade was impossible until the pass learned to publish somewhere of
 * its own.
 *
 * It reuses the gallery's machinery exactly: the same pass, the same shader,
 * the same lens. The only new things are a plane sized to cover the viewport
 * and a second copy of it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlyphPrePass } from '../glyph/GlyphPrePass';
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

/** how long each work holds, and how long the change takes */
const HOLD_MS = 15000;
const FADE_MS = 3200;

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
  gl_FragColor = vec4(color, uFade);
  #include <colorspace_fragment>
}
`;

/** one hero: its own pre-pass, its own target, its own full-bleed plane */
function Hero({
  id,
  tier,
  rtSize,
  opacity,
  live,
  drift,
}: {
  id: string;
  tier: DeviceTier;
  rtSize: number;
  /** 0..1, driven by the crossfade */
  opacity: number;
  /** whether this pass should keep rendering; a faded-out one need not */
  live: boolean;
  /** a small per-hero offset so the two do not sit exactly on top of each other */
  drift: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const [art, setArt] = useState<LoadedArtwork | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const target = useMemo(() => ({ current: null as THREE.WebGLRenderTarget | null }), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const lean = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let alive = true;
    setArt(null);
    void loadArtwork(id, tier).then((a) => {
      if (!alive) return;
      setArt(a);
      /*
       * The full 2000px reproduction, not the 1200px one the gallery asks
       * for. This is the only place a painting is stretched across an entire
       * window, so it is the one place that needs every pixel that exists.
       */
      void loadReveal(a, 'full');
    });
    return () => {
      alive = false;
    };
  }, [id, tier]);

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

    const dist = 6;
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    mesh.position.copy(camera.position).addScaledVector(forward, dist);
    mesh.quaternion.copy(camera.quaternion);
    const vp = viewport.getCurrentViewport(camera, mesh.position, size);
    const vw = vp.width;
    const vh = vp.height;
    const artAspect = iw / ih;
    // a little over-scale, so there is room for the picture to move
    const scale = Math.max(vw / artAspect, vh) * 1.14;
    mesh.scale.set(scale * artAspect, scale, 1);

    /*
     * The picture leans against the pointer. Not a lot — a couple of per cent
     * of the frame — but enough that the background is something you are
     * moving through rather than a still behind the type.
     */
    if (!reducedMotion) {
      const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.55);
      lean.current.x += (-pointer.x * vw * 0.035 - lean.current.x) * k;
      lean.current.y += (pointer.y * vh * 0.035 - lean.current.y) * k;
      mesh.position.addScaledVector(
        new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        lean.current.x + drift,
      );
      mesh.position.y += lean.current.y;
    }

    // the cursor, in the artwork's own pixels: undo the cover fit
    if (!reducedMotion && live) {
      const planeW = scale * artAspect;
      const planeH = scale;
      const wx = (pointer.x * vw) / 2 - lean.current.x - drift;
      const wy = (-pointer.y * vh) / 2 - lean.current.y;
      lens.x = (wx / planeW + 0.5) * iw;
      lens.y = (0.5 - wy / planeH) * ih;
      lens.r = Math.min(iw, ih) * 0.28;
      lens.want = 1;
    }

    if (target.current) u.uGlyph.value = target.current.texture;
    u.uPaint.value = art.fullTex ?? art.wallTex;
    u.uImageSize.value.set(iw, ih);
    u.uLens.value.set(lens.x, lens.y, lens.r);
    u.uLensAmt.value = live ? lens.amt : 0;

    const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.4);
    u.uHasPaint.value += ((art.fullTex ? 1 : 0) - u.uHasPaint.value) * k;
    u.uFade.value = opacity;
  });

  return (
    <group>
      <GlyphPrePass
        artwork={art}
        rtSize={rtSize}
        active={!!art && (live || opacity > 0.01)}
        target={target}
        wash={0.3}
        inkLift={0.9}
        /* smaller letters, so more of the painting shows between them */
        sizeScale={0.68}
        clearAlpha={0}
      />
      <mesh ref={meshRef} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={vert}
          fragmentShader={frag}
          uniforms={uniforms}
          toneMapped={false}
          transparent
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

export function LandingScene({ tier }: { tier: DeviceTier }) {
  const reducedMotion = useStore((s) => s.reducedMotion);
  const heroRT = useMemo(() => (tier.name === 'low' ? tier.rtSize : 2048), [tier]);

  /** the order the heroes are shown in, shuffled once so a visit is its own */
  const order = useMemo(() => {
    const pinned = new URLSearchParams(window.location.search).get('hero');
    if (pinned) return [pinned];
    const a = [...HEROES];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);

  /*
   * Which two works are on screen, and how far between them we are. Both move
   * in one piece of state for the same reason the still slideshow's did: two
   * values that must agree cannot be kept in two places.
   */
  const [pair, setPair] = useState({ from: 0, to: 0 });
  const [mix, setMix] = useState(1);

  useEffect(() => {
    if (order.length < 2 || reducedMotion) return;
    let raf = 0;
    let timer = 0;
    const advance = () => {
      setPair((p) => ({ from: p.to, to: (p.to + 1) % order.length }));
      setMix(0);
      const started = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - started) / FADE_MS);
        setMix(t);
        if (t < 1) raf = requestAnimationFrame(step);
        else timer = window.setTimeout(advance, HOLD_MS);
      };
      raf = requestAnimationFrame(step);
    };
    timer = window.setTimeout(advance, HOLD_MS);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [order, reducedMotion]);

  /*
   * The lens belongs to this page, so this page puts it away. It is module
   * state shared with the gallery's shaders, and this scene drives it open on
   * every frame — without this the first canvas you walk up to has a circle of
   * bare reproduction punched through it.
   */
  useEffect(
    () => () => {
      lens.want = 0;
      lens.amt = 0;
    },
    [],
  );

  const showOutgoing = mix < 1 && pair.from !== pair.to;

  return (
    <group>
      {showOutgoing && (
        <Hero
          key={`out-${pair.from}`}
          id={order[pair.from]}
          tier={tier}
          rtSize={heroRT}
          opacity={1 - mix}
          live={false}
          drift={0}
        />
      )}
      <Hero
        key={`in-${pair.to}`}
        id={order[pair.to]}
        tier={tier}
        rtSize={heroRT}
        opacity={mix}
        live
        drift={0}
      />
    </group>
  );
}
