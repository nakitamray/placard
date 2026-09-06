/**
 * The entrance — the whole idea, in the first second.
 *
 * The exhibition's one claim is that these paintings are made out of the words
 * written about them, and a visitor should not have to go four decisions deep
 * to meet it. So the entrance background is a painting, live, drawn out of its
 * own corpus at full bleed behind the headline, with the reading lens under
 * the cursor: move the mouse and the words give way to paint, and the picture
 * leans very slightly toward you as you go.
 *
 * IT CHANGES. Every fifteen seconds it crossfades to another work — drawn from
 * every work in the exhibition, in an order shuffled per visit — which is why
 * there are two of everything here: two glyph pre-passes writing into two
 * render targets, two planes, and an opacity ramp between them.
 *
 * FILLING A WINDOW WITHOUT LOSING THE PICTURE. A painting cropped to whatever
 * shape the browser happens to be is the one place this exhibition cuts a work
 * down, and a centred crop of a tall canvas throws away the face. Each work
 * carries a focal point, and the plane is slid — never past its own edge, so
 * no gap can open — to hold that point in the middle of the window.
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
import { exhibitionWorks, heroWorks, shuffled, type ExhibitionWork } from '../state/works';
import type { DeviceTier } from '../types';

/** how long each work holds, and how long the change takes */
const HOLD_MS = 15000;
const FADE_MS = 3200;

/** how far the picture leans against the pointer, as a fraction of the window */
const LEAN = 0.035;

/**
 * Over-scale, so both the framing shift and the lean have somewhere to move
 * without opening a gap at the edge of the window.
 *
 * It has to cover BOTH. An earlier version gave the lean its 3.5% and then
 * spent the same slack again holding the focal point in frame, and a work
 * whose framing was already against the stop showed a band of empty
 * background as soon as the cursor moved toward it. Every percent here is
 * picture thrown away, so it is exactly twice the lean and not a percent more.
 */
const OVERSCALE = 1 + LEAN * 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** eased at both ends, so a change starts and stops rather than switching on */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

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
  work,
  tier,
  rtSize,
  fade,
  role,
  live,
}: {
  work: ExhibitionWork;
  tier: DeviceTier;
  rtSize: number;
  /**
   * The crossfade, as mutable state read inside the frame loop rather than as
   * a prop. Setting it through React meant a re-render of the whole entrance
   * sixty times a second for three seconds, which is exactly the stutter the
   * fade was there to avoid.
   */
  fade: React.MutableRefObject<{ mix: number }>;
  /**
   * Which side of the fade this is.
   *
   * The outgoing work stays FULLY OPAQUE and the incoming one fades up over
   * it. Fading both — one down, one up — leaves the two alphas summing to
   * less than one in the middle of the cross, and what shows through the gap
   * is the empty background: a dark flash halfway through every change.
   */
  role: 'in' | 'out';
  /** whether this pass should keep rendering; a faded-out one need not */
  live: boolean;
}) {
  const id = work.id;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const [art, setArt] = useState<LoadedArtwork | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const target = useMemo(() => ({ current: null as THREE.WebGLRenderTarget | null }), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
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
    const scale = Math.max(vw / artAspect, vh) * OVERSCALE;
    const planeW = scale * artAspect;
    const planeH = scale;
    mesh.scale.set(planeW, planeH, 1);

    /*
     * Hold the focal point in the middle of the window.
     *
     * The plane is bigger than the viewport in at least one axis; the slack is
     * how far it can slide before an edge comes into view. Ask for the shift
     * that would centre the work's focal point, then clamp it to that slack —
     * so a portrait's face comes up out of the bottom of the frame, and a
     * window that happens to fit the picture exactly does not move at all.
     */
    const slackX = Math.max(0, (planeW - vw) / 2);
    const slackY = Math.max(0, (planeH - vh) / 2);
    // the lean's half of the slack is reserved before the framing takes its own
    const leanX = Math.min(vw * LEAN, slackX / 2);
    const leanY = Math.min(vh * LEAN, slackY / 2);
    const shiftX = clamp((0.5 - work.focus[0]) * planeW, -(slackX - leanX), slackX - leanX);
    const shiftY = clamp((work.focus[1] - 0.5) * planeH, -(slackY - leanY), slackY - leanY);

    /*
     * The picture leans against the pointer. Not a lot — a couple of per cent
     * of the frame — but enough that the background is something you are
     * moving through rather than a still behind the type.
     */
    if (!reducedMotion) {
      const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.55);
      lean.current.x += (-pointer.x * leanX - lean.current.x) * k;
      lean.current.y += (pointer.y * leanY - lean.current.y) * k;
    }

    // clamped again against the full slack: whatever the two of them ask for
    // between them, an edge of this plane never comes into the window
    const offsetX = clamp(shiftX + (reducedMotion ? 0 : lean.current.x), -slackX, slackX);
    const offsetY = clamp(shiftY + (reducedMotion ? 0 : lean.current.y), -slackY, slackY);
    mesh.position.addScaledVector(
      right.set(1, 0, 0).applyQuaternion(camera.quaternion),
      offsetX,
    );
    mesh.position.y += offsetY;

    // the cursor, in the artwork's own pixels: undo the cover fit
    if (!reducedMotion && live) {
      const wx = (pointer.x * vw) / 2 - offsetX;
      const wy = (-pointer.y * vh) / 2 - offsetY;
      lens.x = (wx / planeW + 0.5) * iw;
      lens.y = (0.5 - wy / planeH) * ih;
      lens.r = Math.min(iw, ih) * 0.21;
      lens.want = 1;
    }

    if (target.current) u.uGlyph.value = target.current.texture;
    u.uPaint.value = art.fullTex ?? art.wallTex;
    u.uImageSize.value.set(iw, ih);
    u.uLens.value.set(lens.x, lens.y, lens.r);
    u.uLensAmt.value = live ? lens.amt : 0;

    const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.4);
    u.uHasPaint.value += ((art.fullTex ? 1 : 0) - u.uHasPaint.value) * k;
    u.uFade.value = role === 'out' ? 1 : smoothstep(fade.current.mix);
  });

  return (
    <group>
      <GlyphPrePass
        artwork={art}
        rtSize={rtSize}
        active={!!art}
        target={target}
        wash={0.3}
        inkLift={0.9}
        /* smaller letters, so more of the painting shows between them */
        sizeScale={0.68}
        clearAlpha={0}
      />
      {/* the outgoing work is drawn first; both are behind everything else */}
      <mesh ref={meshRef} frustumCulled={false} renderOrder={role === 'out' ? -2 : -1}>
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
  const heroRT = useMemo(() => (tier.name === 'low' ? tier.rtSize : 2048), [tier]);

  /**
   * Every work in the exhibition, in an order shuffled per visit, so nobody
   * arrives twice to the same entrance. `?hero=<id>` pins one, which is how a
   * single work's framing is checked without waiting for it to come round.
   */
  const [order, setOrder] = useState<ExhibitionWork[]>([]);
  useEffect(() => {
    let alive = true;
    void exhibitionWorks().then((all) => {
      if (!alive || !all.length) return;
      const pinned = new URLSearchParams(window.location.search).get('hero');
      const one = pinned && all.find((w) => w.id === pinned);
      setOrder(one ? [one] : shuffled(heroWorks(all)));
    });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Which two works are on screen, and how far between them we are. Both move
   * in one piece of state because two values that must agree cannot be kept in
   * two places.
   */
  const [pair, setPair] = useState({ from: 0, to: 0 });
  /** true only while two works are on screen at once */
  const [crossing, setCrossing] = useState(false);
  const fade = useRef({ mix: 1 });

  useEffect(() => {
    if (order.length < 2) return;
    let raf = 0;
    let timer = 0;
    const advance = () => {
      setPair((p) => ({ from: p.to, to: (p.to + 1) % order.length }));
      fade.current.mix = 0;
      setCrossing(true);
      const started = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - started) / FADE_MS);
        fade.current.mix = t;
        if (t < 1) {
          raf = requestAnimationFrame(step);
        } else {
          // the only render in the whole change: the outgoing work leaves the
          // tree, and its pre-pass and its target go with it
          setCrossing(false);
          timer = window.setTimeout(advance, HOLD_MS);
        }
      };
      raf = requestAnimationFrame(step);
    };
    timer = window.setTimeout(advance, HOLD_MS);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [order]);

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

  if (!order.length) return null;

  const outgoing = crossing && pair.from !== pair.to ? order[pair.from] : null;
  const incoming = order[pair.to];

  return (
    <group>
      {outgoing && (
        <Hero
          key={`out-${outgoing.id}`}
          work={outgoing}
          tier={tier}
          rtSize={heroRT}
          fade={fade}
          role="out"
          live={false}
        />
      )}
      <Hero
        key={`in-${incoming.id}`}
        work={incoming}
        tier={tier}
        rtSize={heroRT}
        fade={fade}
        role="in"
        live
      />
    </group>
  );
}
