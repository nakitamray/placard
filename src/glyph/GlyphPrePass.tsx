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
}: {
  artwork: LoadedArtwork | null;
  rtSize: number;
  active: boolean;
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
    glyphRT.current = rt;
    return () => {
      if (glyphRT.current === rt) glyphRT.current = null;
      rt.dispose();
    };
  }, [rt]);

  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
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

    const prev = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.setClearColor('#241f1a', 1);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(prev);

    // testing handle: confirms the pre-pass is live without touching the GPU
    (window as unknown as Record<string, unknown>).__prepass = {
      count: artwork.glyphs.count,
      corpusLen: artwork.corpusLen,
      charOffset: u.uCharOffset.value,
    };
  }, -1); // negative priority = before the default render (spec §7.3)

  return null;
}
