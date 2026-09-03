/**
 * GlyphPrePass — spec §7.3.
 *
 * The glyph mesh is never drawn into the main scene. It renders in a
 * pre-pass (useFrame priority −1) into one reused WebGLRenderTarget, which
 * the active artwork plane samples as a map. Exactly one artwork renders
 * live glyphs at any moment (spec §7.4 LOD).
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

const CHAR_RATE = 6; // chars/sec through the corpus (spec §4.3)

function buildGeometry(art: LoadedArtwork): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  // unit quad, -0.5..0.5 — 4 verts, 2 tris (spec §7.1)
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

  // swap attribute buffers when the active artwork changes (spec §7.5 —
  // buffers are precomputed; this is only bufferData calls)
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
    // corpus animation frozen under prefers-reduced-motion (spec §15)
    if (!reducedMotion) {
      timeRef.current += delta;
    }
    const u = material.uniforms;
    u.uCharOffset.value = Math.floor(timeRef.current * CHAR_RATE);
    u.uBreathe.value = timeRef.current * 1.4;
    u.uDissolve.value = useStore.getState().dissolve;
    if (wash !== undefined) u.uWash.value = wash;
    if (inkLift !== undefined) u.uInkLift.value = inkLift;
    u.uSizeScale.value = sizeScale ?? 1;

    // Thread Pull: fade the extracted region out of the canvas while the DOM
    // text assembles, and hold its characters still (spec: the rest of the
    // painting remains intact and moving)
    // The lens eases open and shut here rather than in a tween: it is written
    // by every pointer move, and a GSAP tween restarted at pointer rate would
    // spend more time being created than running.
    const k = 1 - Math.pow(0.0015, Math.min(delta, 0.1) / 0.22);
    lens.amt += (lens.want - lens.amt) * k;
    u.uLens.value.set(lens.x, lens.y, lens.r);
    u.uLensAmt.value = lens.amt;

    const tp = threadPullAnim;
    u.uDetachAmt.value = tp.detach;
    u.uCharOffsetFrozen.value = tp.frozenOffset;
    u.uDetachBox.value.set(tp.box[0], tp.box[1], tp.box[2], tp.box[3]);

    const prev = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.setClearColor('#241f1a', clearAlpha);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(prev);

    // testing handle: confirms the pre-pass is live without touching the GPU
    (window as unknown as Record<string, unknown>).__prepass = {
      count: artwork.glyphs.count,
      corpusLen: artwork.corpusLen,
      charOffset: u.uCharOffset.value,
      detach: tp.detach,
    };
  }, -1); // negative priority = before the default render (spec §7.3)

  return null;
}
