/**
 * GlyphPrePass
 *
 * The glyph mesh is never drawn into the main scene. It renders in a
 * pre-pass (useFrame priority −1) into one reused WebGLRenderTarget, which
 * the active artwork plane samples as a map. Exactly one artwork renders
 * live glyphs at any moment.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getGlyphAtlas } from './glyphAtlas';
import { createGlyphMaterial } from './GlyphMaterial';
import type { LoadedArtwork } from './artworkLoader';
import { useStore } from '../state/store';
import { threadPullAnim } from '../threadpull/state';
import { lens } from '../transitions/lens';

export const glyphRT: { current: THREE.WebGLRenderTarget | null } = { current: null };

/**
 * What the pass last drew.
 *
 * Thread Pull needs the character offset the field was showing at the moment
 * a region was grabbed, so it can hold those exact letters still while the
 * DOM text assembles. One shared object, written in place — it used to be a
 * fresh object hung on `window` every frame, which is a few thousand
 * throwaway allocations a minute for one number.
 */
export const prepass = { count: 0, corpusLen: 0, charOffset: 0, detach: 0 };
if (typeof window !== 'undefined') {
  // the same object, under the name the browser tests look for
  (window as unknown as Record<string, unknown>).__prepass = prepass;
}

const CHAR_RATE = 6; // chars/sec through the corpus

/**
 * How often the field is redrawn when nothing is happening to it.
 *
 * This pass is the most expensive thing in the gallery: every glyph of the
 * active work — tens of thousands of instanced quads, each sampling a corpus
 * texture and a glyph atlas — rendered into a render target up to 2048 square.
 * It was running on every frame, and almost none of those frames were
 * different: the corpus steps six characters a second and the breathing is a
 * slow sine.
 *
 * So a still field redraws thirty times a second, and anything a visitor is
 * actually doing to it — moving the reading lens, dissolving the work, pulling
 * a thread out of it — takes it straight back to the full frame rate for as
 * long as that lasts. Half the cost of standing in front of a painting, and
 * nothing about the picture changes.
 */
const IDLE_HZ = 30;
/** the slack keeps a 30fps budget from losing every second pass to rounding */
const IDLE_STEP = 1 / IDLE_HZ - 0.002;

function buildGeometry(art: LoadedArtwork): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  // unit quad, -0.5..0.5 — 4 verts, 2 tris
  g.setAttribute(
    'aQuad',
    new THREE.Float32BufferAttribute([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 2),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const { glyphs } = art;
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(glyphs.pos, 2));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(glyphs.size, 1));
  g.setAttribute('aRot', new THREE.InstancedBufferAttribute(glyphs.rot, 1));
  g.setAttribute('aColorIndex', new THREE.InstancedBufferAttribute(glyphs.cidx, 1));
  g.setAttribute('aSlot', new THREE.InstancedBufferAttribute(glyphs.slot, 1));
  g.instanceCount = glyphs.count;
  return g;
}

export function GlyphPrePass({
  artwork,
  rtSize,
  active,
  wash,
  inkLift,
  sizeScale,
  clearAlpha = 1,
  target,
}: {
  artwork: LoadedArtwork | null;
  rtSize: number;
  active: boolean;
  /** cell fill opacity — lower lets whatever is behind the field show through */
  wash?: number;
  inkLift?: number;
  /** below 1, the letters are drawn smaller and more of the picture shows */
  sizeScale?: number;
  /** 0 renders the field on transparency, so it can be composited over paint */
  clearAlpha?: number;
  /**
   * Somewhere to publish this pass's render target other than the shared
   * `glyphRT`. Two fields can then be on screen at once — which is what a
   * crossfade between two heroes needs, and what the single global target
   * made impossible.
   */
  target?: { current: THREE.WebGLRenderTarget | null };
}) {
  const gl = useThree((s) => s.gl);
  const reducedMotion = useStore((s) => s.reducedMotion);

  const rt = useMemo(() => {
    const t = new THREE.WebGLRenderTarget(rtSize, rtSize, {
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    return t;
  }, [rtSize]);

  useEffect(() => {
    const slot = target ?? glyphRT;
    slot.current = rt;
    return () => {
      if (slot.current === rt) slot.current = null;
      rt.dispose();
    };
  }, [rt, target]);

  /**
   * Something about the pass itself changed and the next frame must draw,
   * whatever the throttle would otherwise say. A new artwork, a new target, or
   * the pass being switched back on: all of them leave a render target holding
   * a picture of something else.
   */
  const dirty = useRef(true);

  // anything that changes what the target should be holding
  useEffect(() => {
    dirty.current = true;
  }, [artwork, rt, active, clearAlpha]);

  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  /*
   * A material per pass, not one shared module-wide. Two passes running at
   * once during a crossfade would otherwise write each other's uniforms —
   * corpus texture, image size, glyph scale — and both fields would render as
   * whichever one wrote last.
   */
  const material = useMemo(() => {
    const { atlas, metrics } = getGlyphAtlas();
    return createGlyphMaterial(atlas, metrics);
  }, []);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const timeRef = useRef(0);
  /** seconds since the field was last drawn */
  const idle = useRef(0);
  /** what it was showing then, so a frame that changes nothing can be skipped */
  const was = useRef({
    lensX: Number.NaN,
    lensY: Number.NaN,
    dissolve: Number.NaN,
    detach: Number.NaN,
    wash: undefined as number | undefined,
    inkLift: undefined as number | undefined,
    sizeScale: undefined as number | undefined,
  });

  // swap attribute buffers when the active artwork changes ( // buffers are precomputed; this is only bufferData calls)
  useEffect(() => {
    if (!artwork) return;
    const geo = buildGeometry(artwork);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.clear();
    scene.add(mesh);
    meshRef.current = mesh;

    const u = material.uniforms;
    u.uCorpus.value = artwork.corpusTex;
    u.uCorpusSize.value.set(artwork.corpusTex.image.width, artwork.corpusTex.image.height);
    u.uCorpusLen.value = artwork.corpusLen;
    u.uPalette.value = artwork.paletteTex;
    u.uPaletteSize.value = artwork.paletteSize;
    u.uImageSize.value.set(artwork.glyphs.imageW, artwork.glyphs.imageH);

    // letterbox the ortho camera so the artwork aspect is preserved in the RT
    return () => {
      geo.dispose();
    };
  }, [artwork, material, scene]);

  useFrame((_, delta) => {
    if (!active || !artwork || !meshRef.current) return;
    // corpus animation frozen under prefers-reduced-motion
    if (!reducedMotion) {
      timeRef.current += delta;
    }

    /*
     * The lens eases open and shut here rather than in a tween: it is written
     * by every pointer move, and a GSAP tween restarted at pointer rate would
     * spend more time being created than running. It eases on every frame,
     * whether or not this one is drawn — the easing is a multiply, and the
     * pass simply reads wherever it has got to.
     */
    const k = 1 - Math.pow(0.0015, Math.min(delta, 0.1) / 0.22);
    lens.amt += (lens.want - lens.amt) * k;

    /*
     * IS ANYTHING HAPPENING TO THE FIELD?
     *
     * Everything a visitor can do to it: slide the reading lens across it,
     * dissolve the work out of it, tear a region off it. While any of those is
     * moving the pass runs every frame, because those are the moments the
     * smoothness is the point. The rest of the time the field is a slow
     * breath and six characters a second, and thirty a second draws that
     * perfectly.
     */
    const dissolve = useStore.getState().dissolve;
    const tp = threadPullAnim;
    const busy =
      dirty.current ||
      Math.abs(lens.want - lens.amt) > 0.002 ||
      lens.x !== was.current.lensX ||
      lens.y !== was.current.lensY ||
      dissolve !== was.current.dissolve ||
      tp.detach !== was.current.detach ||
      wash !== was.current.wash ||
      inkLift !== was.current.inkLift ||
      sizeScale !== was.current.sizeScale;

    /*
     * Under `prefers-reduced-motion` the corpus is frozen, so a field nobody
     * is touching is not merely changing slowly — it is not changing at all,
     * and the pass has nothing to draw that is not already on screen.
     */
    idle.current += delta;
    if (!busy && (reducedMotion || idle.current < IDLE_STEP)) return;
    idle.current = 0;
    dirty.current = false;

    const w = was.current;
    w.lensX = lens.x;
    w.lensY = lens.y;
    w.dissolve = dissolve;
    w.detach = tp.detach;
    w.wash = wash;
    w.inkLift = inkLift;
    w.sizeScale = sizeScale;

    const u = material.uniforms;
    u.uCharOffset.value = Math.floor(timeRef.current * CHAR_RATE);
    u.uBreathe.value = timeRef.current * 1.4;
    u.uDissolve.value = dissolve;
    if (wash !== undefined) u.uWash.value = wash;
    if (inkLift !== undefined) u.uInkLift.value = inkLift;
    u.uSizeScale.value = sizeScale ?? 1;
    u.uLens.value.set(lens.x, lens.y, lens.r);
    u.uLensAmt.value = lens.amt;

    // Thread Pull: fade the extracted region out of the canvas while the DOM
    // text assembles, and hold its characters still (spec: the rest of the
    // painting remains intact and moving)
    u.uDetachAmt.value = tp.detach;
    u.uCharOffsetFrozen.value = tp.frozenOffset;
    u.uDetachBox.value.set(tp.box[0], tp.box[1], tp.box[2], tp.box[3]);

    const prev = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.setClearColor('#241f1a', clearAlpha);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(prev);

    // what the field is showing, for Thread Pull and for the browser tests
    prepass.count = artwork.glyphs.count;
    prepass.corpusLen = artwork.corpusLen;
    prepass.charOffset = u.uCharOffset.value;
    prepass.detach = tp.detach;
  }, -1); // negative priority = before the default render

  return null;
}
