/**
 * The Atlas — the whole collection as one shape.
 *
 * A museum tells you who painted a thing and when. What it cannot tell you,
 * standing in front of one canvas, is that the man who taught the painter of
 * the room you were in an hour ago is three rooms away in another building,
 * or that the Japanese print you walked past in London is the reason the sky
 * in Arles looks like that. Those are the facts that make a collection a
 * collection, and they are invisible in a corridor.
 *
 * So they are a graph you can turn around — and, more to the point, one you
 * have to earn. It opens holding only what you have actually seen; everything
 * else is an unnamed mote. Pull a thread out of a painting and the passage is
 * read for the words that give a connection away: a place the painter worked,
 * a movement, a rival, a patron. The edge appears, the mote gets a name, and
 * the map grows a little every time you read something.
 *
 * IMPLEMENTATION
 *   Its own <Canvas>, mounted only while open, so nothing here can disturb
 *   the corridor's renderer or its render target. Layout is a plain
 *   force-directed simulation in `useFrame` — repulsion between every pair,
 *   springs along the edges, a weak pull to the middle — seeded from a hash of
 *   each id so the map has the same shape every time you open it. It settles
 *   and then stops: once the total energy falls below a floor the simulation
 *   costs nothing until something new appears.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  hydrateWorks,
  linkKey,
  useAtlas,
  type AtlasGraph,
  type AtlasNode,
} from '../state/atlas';
import { useStore, loadMuseum } from '../state/store';
import { sfx } from '../lib/audio';
import { FrameGovernor } from '../render/frameGovernor';
import type { MuseumIndexEntry } from '../types';

/** one colour per kind, out of the exhibition's own palette */
const KIND_COLOUR: Record<string, string> = {
  painter: '#E8DFD0',
  work: '#C9A227',
  place: '#7FA8C9',
  movement: '#C98A7F',
  event: '#9FB98A',
};

const KIND_LABEL: Record<string, string> = {
  painter: 'Painter',
  work: 'Painting',
  place: 'Place',
  movement: 'Movement',
  event: 'Moment',
};

/* ── layout ─────────────────────────────────────────────────────────────── */

interface Body {
  id: string;
  p: THREE.Vector3;
  v: THREE.Vector3;
  degree: number;
}

/** deterministic 0..1 from an id, so the map is the same shape every visit */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function seedBodies(graph: AtlasGraph): Body[] {
  return graph.nodes.map((n) => {
    const t = hash01(n.id, 1) * Math.PI * 2;
    const u = hash01(n.id, 2) * 2 - 1;
    const r = 9 + hash01(n.id, 3) * 5;
    const s = Math.sqrt(1 - u * u);
    return {
      id: n.id,
      p: new THREE.Vector3(r * s * Math.cos(t), r * s * Math.sin(t) * 0.7, r * u),
      v: new THREE.Vector3(),
      degree: (graph.around.get(n.id) ?? []).length,
    };
  });
}

/**
 * The sky the graph hangs in.
 *
 * A dark rectangle behind a diagram reads as a slide. What makes this read as
 * a place you are inside is depth you can see past the subject, so there are
 * a few thousand points scattered right out to the far clip — thin at the
 * edges of the room and thickening toward the middle, where the web is, so
 * the graph looks like the dense part of something rather than an object on a
 * background.
 *
 * The distribution is r = R · u^(1/1.4) on a uniform sphere, which piles more
 * of them toward the centre than a uniform volume would while still leaving
 * the far corners occupied. Built once and never touched again: it is a
 * single draw call and it does not move.
 */
function Starfield({ count = 2600 }: { count?: number }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const warm = new THREE.Color('#F2EBDF');
    const cool = new THREE.Color('#7FA8C9');
    const gilt = new THREE.Color('#C9A227');
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const r = 6 + 74 * Math.pow(u, 1 / 1.4);
      const t = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - z * z);
      pos[i * 3] = r * s * Math.cos(t);
      pos[i * 3 + 1] = r * s * Math.sin(t) * 0.8;
      pos[i * 3 + 2] = r * z;
      // a few are warm, a few gilt, most near-white and very dim
      const pick = Math.random();
      const c = pick > 0.94 ? gilt : pick > 0.78 ? cool : warm;
      const b = 0.16 + Math.random() * 0.5;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [count]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial
        size={0.13}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

function Graph({
  graph,
  onPick,
  focus,
  onHover,
}: {
  graph: AtlasGraph;
  onPick: (n: AtlasNode) => void;
  /** the node whose neighbourhood is lit: the selection, or what is hovered */
  focus: string | null;
  onHover: (id: string, leaving: boolean) => void;
}) {
  const found = useAtlas((s) => s.found);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  const bodies = useMemo(() => seedBodies(graph), [graph]);
  /*
   * The node meshes, so the frame loop can move them.
   *
   * THIS IS NOT OPTIONAL. `position={b.p}` hands r3f a Vector3 whose identity
   * never changes, and r3f writes props into the object on a React commit —
   * so a node drawn that way sits wherever it was at the last render while the
   * simulation carries on mutating `b.p` underneath it. The edges are rewritten
   * from those same live vectors every frame, so the two disagree, and what you
   * see is a web of lines floating away from the dots they are supposed to
   * join. It looked fine for as long as the layout happened to settle during a
   * render; adding nodes made it settle later, and the whole graph came apart.
   */
  const nodeRefs = useRef<Array<THREE.Mesh | null>>([]);
  const index = useMemo(() => new Map(bodies.map((b, i) => [b.id, i])), [bodies]);
  const energy = useRef(1);
  const quietRef = useRef<THREE.LineSegments>(null);

  /**
   * Everything the focused node touches: the node itself, its found edges, and
   * whatever is on the other end of them. Clicking a node and not being able
   * to see what it connects to was the map's central failure — the whole point
   * of a graph is the edges, and they were all one colour whether they had
   * anything to do with what you had just clicked or not.
   */
  const near = useMemo(() => {
    if (!focus) return null;
    const nodes = new Set<string>([focus]);
    const links = new Set<string>();
    for (const l of graph.around.get(focus) ?? []) {
      if (!found.has(linkKey(l))) continue;
      links.add(linkKey(l));
      nodes.add(l.a === focus ? l.b : l.a);
    }
    return { nodes, links };
  }, [focus, graph, found]);

  /*
   * Two geometries rather than one: the quiet web, and the edges belonging to
   * whatever is focused. Line width is a lie in WebGL — `linewidth` is ignored
   * on every desktop driver — so the difference has to be carried by colour
   * and opacity, which means two materials, which means two draws.
   */
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(graph.links.length * 6), 3));
    return g;
  }, [graph]);
  const hotGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(graph.links.length * 6), 3));
    return g;
  }, [graph]);

  useEffect(() => () => lineGeo.dispose(), [lineGeo]);
  useEffect(() => () => hotGeo.dispose(), [hotGeo]);

  // a new discovery wakes the simulation back up
  useEffect(() => {
    energy.current = 1;
  }, [found]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    if (energy.current > 0.0025) {
      let moved = 0;
      // repulsion — every pair, which at this size is a few thousand
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          const dx = a.p.x - b.p.x;
          const dy = a.p.y - b.p.y;
          const dz = a.p.z - b.p.z;
          const d2 = dx * dx + dy * dy + dz * dz + 0.6;
          // stronger than it was: with a hundred and thirty nodes the old
          // figure let the middle of the web pack into a ball you could not
          // read an edge out of
          const f = 38 / d2;
          const d = Math.sqrt(d2);
          a.v.x += (dx / d) * f * dt;
          a.v.y += (dy / d) * f * dt;
          a.v.z += (dz / d) * f * dt;
          b.v.x -= (dx / d) * f * dt;
          b.v.y -= (dy / d) * f * dt;
          b.v.z -= (dz / d) * f * dt;
        }
        // a weak pull to the middle, so nothing drifts to infinity
        a.v.addScaledVector(a.p, -0.5 * dt);
      }
      // springs
      for (const l of graph.links) {
        const ia = index.get(l.a);
        const ib = index.get(l.b);
        if (ia === undefined || ib === undefined) continue;
        const a = bodies[ia];
        const b = bodies[ib];
        const dx = b.p.x - a.p.x;
        const dy = b.p.y - a.p.y;
        const dz = b.p.z - a.p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const f = (d - 4.4) * 1.5 * dt;
        a.v.x += (dx / d) * f;
        a.v.y += (dy / d) * f;
        a.v.z += (dz / d) * f;
        b.v.x -= (dx / d) * f;
        b.v.y -= (dy / d) * f;
        b.v.z -= (dz / d) * f;
      }
      for (const b of bodies) {
        b.v.multiplyScalar(0.86);
        b.p.addScaledVector(b.v, dt * 6);
        moved += b.v.lengthSq();
      }
      energy.current = moved / bodies.length;
    }

    // the nodes themselves, moved from the simulation rather than from React
    for (let i = 0; i < bodies.length; i++) {
      nodeRefs.current[i]?.position.copy(bodies[i].p);
    }

    // edges — the found ones, sorted into the quiet web and the lit
    // neighbourhood of whatever is focused
    const pos = lineGeo.getAttribute('position') as THREE.BufferAttribute;
    const hot = hotGeo.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    let h = 0;
    for (const l of graph.links) {
      const key = linkKey(l);
      if (!found.has(key)) continue;
      const a = bodies[index.get(l.a)!];
      const b = bodies[index.get(l.b)!];
      if (!a || !b) continue;
      if (near?.links.has(key)) {
        hot.setXYZ(h * 2, a.p.x, a.p.y, a.p.z);
        hot.setXYZ(h * 2 + 1, b.p.x, b.p.y, b.p.z);
        h++;
      } else {
        pos.setXYZ(n * 2, a.p.x, a.p.y, a.p.z);
        pos.setXYZ(n * 2 + 1, b.p.x, b.p.y, b.p.z);
        n++;
      }
    }
    pos.needsUpdate = true;
    hot.needsUpdate = true;
    lineGeo.setDrawRange(0, n * 2);
    hotGeo.setDrawRange(0, h * 2);
    if (quietRef.current) {
      // the unfocused web is a haze the nodes sit in, not a diagram of its own:
      // at full strength a hundred and eighty edges is all anyone sees
      (quietRef.current.material as THREE.LineBasicMaterial).opacity = near ? 0.07 : 0.17;
    }

    /*
     * Labels, projected — written straight to the DOM, never through React.
     *
     * And de-collided in screen space, which is the single thing that decides
     * whether this map is readable. Names are laid out most-connected first;
     * one that would land on top of a name already placed this frame is simply
     * dropped for the frame. Turn the map and it reappears as soon as it has
     * room. Without this the middle of the web is a pile of overlapping type
     * that gets worse the more you discover — the opposite of a reward.
     */
    const g = groupRef.current;
    if (g) {
      placed.length = 0;
      for (const b of ordered) {
        const el = labelEls.get(b.id);
        if (!el) continue;
        w.copy(b.p).applyMatrix4(g.matrixWorld);
        const dist = w.distanceTo(camera.position);
        v.copy(w).project(camera);
        const x = ((v.x + 1) / 2) * size.width;
        const y = ((1 - v.y) / 2) * size.height;
        el.style.transform = `translate(-50%, 0) translate(${x}px, ${y}px)`;

        if (v.z > 1) {
          hide(el);
          continue;
        }
        // half the label's own width, so the test is against real extents
        const half = el.offsetWidth / 2 + 8;
        let clash = false;
        for (const q of placed) {
          if (Math.abs(q.y - y) < 15 && Math.abs(q.x - x) < half + q.half) {
            clash = true;
            break;
          }
        }
        // whatever is focused always gets its name, collision or not
        const forced = !!near && near.nodes.has(b.id);
        if (clash && !forced) {
          hide(el);
          continue;
        }
        placed.push({ x, y, half });

        // Fade by distance from the camera, not by NDC z. Everything here sits
        // at roughly the same clip depth — 0.97 or so — and reading opacity
        // off that left every name in the map at 13%.
        const byDist = Math.max(0.3, Math.min(1, 1.5 - dist / 52));
        // a label belonging to nothing you are looking at gets out of the way
        const dim = near && !near.nodes.has(b.id) ? 0.2 : 1;
        el.style.opacity = String(byDist * dim);
        el.style.pointerEvents = 'auto';
      }
    }
  });

  const v = useMemo(() => new THREE.Vector3(), []);
  const w = useMemo(() => new THREE.Vector3(), []);
  /** most-connected first, so the important names win a collision */
  const ordered = useMemo(() => [...bodies].sort((a, b) => b.degree - a.degree), [bodies]);
  /** label extents already claimed this frame, reused rather than reallocated */
  const placed = useMemo<Array<{ x: number; y: number; half: number }>>(() => [], []);

  return (
    <group ref={groupRef} name="atlas-graph">
      {/* the quiet web */}
      <lineSegments ref={quietRef} geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial color="#C9A227" transparent opacity={0.3} depthWrite={false} />
      </lineSegments>
      {/* and the edges of whatever is focused, in bone rather than gilt so
          they read as lit rather than merely brighter */}
      <lineSegments geometry={hotGeo} frustumCulled={false}>
        <lineBasicMaterial color="#F2EBDF" transparent opacity={0.95} depthWrite={false} />
      </lineSegments>
      {bodies.map((b, bi) => {
        const node = graph.byId.get(b.id)!;
        const known = found.has(b.id);
        const lit = !near || near.nodes.has(b.id);
        const on = focus === b.id;
        const r = known ? 0.15 + Math.min(0.3, b.degree * 0.022) : 0.06;
        // undiscovered motes are the map's background noise, and there are
        // eighty of them: they should read as "there is more here", not as
        // eighty things competing with what you have actually found
        const opacity = known ? (on ? 1 : lit ? 0.92 : 0.24) : near ? 0.08 : 0.18;
        return (
          <mesh
            key={b.id}
            ref={(el) => {
              nodeRefs.current[bi] = el;
            }}
            position={b.p}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (known) onHover(b.id, false);
            }}
            // clear only if this node is still the one being reported: r3f can
            // deliver the "out" of the node you left after the "over" of the
            // one you arrived at, which would blank the highlight you just lit
            onPointerOut={() => onHover(b.id, true)}
            onClick={(e) => {
              e.stopPropagation();
              if (known) onPick(node);
            }}
          >
            <sphereGeometry args={[r * (on ? 1.6 : 1), 16, 12]} />
            <meshBasicMaterial
              color={known ? KIND_COLOUR[node.kind] : '#6E5B4A'}
              transparent
              opacity={opacity}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ── the overlay ────────────────────────────────────────────────────────── */

export function AtlasView() {
  const open = useAtlas((s) => s.open);
  const setOpen = useAtlas((s) => s.setOpen);
  const graph = useAtlas((s) => s.graph);
  const found = useAtlas((s) => s.found);
  const selected = useAtlas((s) => s.selected);
  const select = useAtlas((s) => s.select);
  const museums = useStore((s) => s.museums);
  const setMuseum = useStore((s) => s.setMuseum);
  const setIndex = useStore((s) => s.setIndex);
  const setPhase = useStore((s) => s.setPhase);
  const spin = useRef<{ yaw: number; pitch: number; zoom: number }>({
    yaw: 0.4,
    pitch: -0.2,
    zoom: 1,
  });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  /** which connection is opened out to read */
  const [openEdge, setOpenEdge] = useState<string | null>(null);
  /** what the pointer is over, which lights its edges without committing */
  const [hover, setHover] = useState<string | null>(null);
  /** what the map is currently about: the selection, or failing that a hover */
  const focus = selected ?? hover;

  /*
   * Opening the map is the moment the real titles are worth fetching. Five
   * manifests, cached, so this costs nothing on a second opening — and the
   * graph itself has been in memory since the page loaded, because discovery
   * starts long before anybody comes here.
   */
  useEffect(() => {
    if (!open || !museums.length) return;
    void Promise.all(museums.map((m: MuseumIndexEntry) => loadMuseum(m.id))).then((all) => {
      hydrateWorks(
        all.flatMap((m) =>
          m.artworks.map((a) => ({ id: a.id, title: a.title, artist: a.artist, museum: m.id })),
        ),
      );
    });
  }, [open, museums]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setOpen]);

  if (!open) return null;

  const node = selected && graph ? graph.byId.get(selected) : null;
  const edges =
    node && graph
      ? (graph.around.get(node.id) ?? []).filter((l) => found.has(linkKey(l)))
      : [];
  const openLink = openEdge && edges.find((l) => linkKey(l) === openEdge);
  const openOther =
    openLink && graph
      ? graph.byId.get(openLink.a === node?.id ? openLink.b : openLink.a)
      : null;

  const totalLinks = graph?.links.length ?? 0;
  const foundLinks = graph ? graph.links.filter((l) => found.has(linkKey(l))).length : 0;

  const enter = async (artwork: string, museumId: string) => {
    const m = await loadMuseum(museumId);
    const i = m.artworks.findIndex((a) => a.id === artwork);
    if (i < 0) return;
    setOpen(false);
    setMuseum(m);
    setIndex(i);
    const s = useStore.getState();
    if (s.phase === 'landing') s.setPhase('corridor');
    setPhase('warp');
  };

  return (
    <div className="atlas" role="dialog" aria-label="The atlas">
      <div
        className="atlas-stage"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          spin.current.yaw += dx * 0.006;
          spin.current.pitch += dy * 0.006;
          spin.current.pitch = Math.max(-1.2, Math.min(1.2, spin.current.pitch));
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            moved: drag.current.moved + Math.abs(dx) + Math.abs(dy),
          };
        }}
        onPointerUp={() => {
          // turning the map is not the same gesture as putting it down: only
          // a press that stayed still counts as "nothing selected"
          if (drag.current && drag.current.moved < 5) {
            select(null);
            setOpenEdge(null);
            setHover(null);
          }
          drag.current = null;
        }}
        onPointerLeave={() => (drag.current = null)}
        onWheel={(e) => {
          spin.current.zoom = Math.max(0.45, Math.min(2.4, spin.current.zoom * (1 + e.deltaY * 0.0012)));
        }}
      >
        <Canvas
          /* the same capped loop the corridor runs on: the graph settles and
             then holds still, and a still graph does not need a hundred and
             twenty frames a second to go on holding still */
          frameloop="never"
          camera={{ fov: 45, position: [0, 0, 40], near: 0.1, far: 220 }}
          dpr={[1, 1.75]}
        >
          <FrameGovernor maxFps={60} running />
          <Rig spin={spin} />
          <Starfield />
          {graph && (
            <Graph
              graph={graph}
              focus={focus}
              onHover={(id, leaving) =>
                setHover((h) => (leaving ? (h === id ? null : h) : id))
              }
              onPick={(n) => {
                select(n.id);
                setOpenEdge(null);
                sfx.link();
              }}
            />
          )}
        </Canvas>
        {graph && <LabelLayer graph={graph} focus={focus} />}
      </div>

      {/* the way out is where the way out always is */}
      <button className="caption gallery-back atlas-back" onClick={() => setOpen(false)}>
        ← Back
      </button>
      <p className="caption corridor-title atlas-level">The atlas</p>

      <header className="atlas-head">
        <h2 className="display atlas-title">How the collection is joined</h2>
      </header>

      <p className="caption atlas-progress">
        {foundLinks} of {totalLinks} connections found · click a node to light what it joins ·
        pull threads out of the paintings to uncover more
      </p>

      <div className="atlas-legend caption">
        {(['work', 'painter', 'place', 'movement', 'event'] as const).map((k) => (
          <span key={k} className="atlas-key">
            <i style={{ background: KIND_COLOUR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      {node && (
        <aside className="atlas-panel">
          <p className="caption atlas-kind">{KIND_LABEL[node.kind]}</p>
          <h3 className="title atlas-name">{node.label}</h3>
          {node.note && <p className="caption atlas-note">{node.note}</p>}
          {node.artwork && node.museum && (
            <button
              className="caption atlas-enter"
              onClick={() => void enter(node.artwork!, node.museum!)}
            >
              Walk into this room →
            </button>
          )}

          <p className="caption atlas-edges-head">
            {edges.length ? `${edges.length} connection${edges.length === 1 ? '' : 's'} found` : ''}
          </p>
          <ul className="atlas-edges">
            {edges.map((l) => {
              const otherId = l.a === node.id ? l.b : l.a;
              const other = graph?.byId.get(otherId);
              if (!other) return null;
              const key = linkKey(l);
              const isOpen = openEdge === key;
              return (
                <li key={key} className={isOpen ? 'is-open' : ''}>
                  <button
                    className="atlas-edge"
                    onClick={() => setOpenEdge(isOpen ? null : key)}
                  >
                    <span className="caption atlas-edge-kind">{l.kind}</span>
                    <span className="atlas-edge-name">
                      {other.label}
                      <span className="atlas-edge-chev" aria-hidden>
                        {isOpen ? '−' : '+'}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="atlas-edge-body">
                      {/* what actually happened between the two of them */}
                      <p className="body atlas-edge-note">
                        {l.note ??
                          `${graph?.byId.get(l.a)?.label} — ${l.kind} — ${graph?.byId.get(l.b)?.label}.`}
                      </p>
                      <button
                        className="caption atlas-goto"
                        onClick={() => {
                          setOpenEdge(null);
                          select(otherId);
                        }}
                      >
                        Go to {other.label} →
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {!edges.length && (
              <li className="caption atlas-empty">
                Nothing found yet. Press space in one of their rooms and read a passage.
              </li>
            )}
          </ul>
        </aside>
      )}

      {/* a connection opened out with nothing selected under it still reads */}
      {openLink && openOther && !node && (
        <aside className="atlas-panel">
          <p className="body atlas-edge-note">{openLink.note}</p>
        </aside>
      )}

    </div>
  );
}

/*
 * The DOM elements the frame loop moves, registered by the labels themselves.
 *
 * IT HAS TO BE REGISTRATION, NOT A QUERY. The graph lives inside the r3f
 * canvas, which is its own React root: an effect in there can run before the
 * label layer's own elements have been committed to the page, and a label the
 * frame loop never learned about is never moved off the top-left corner —
 * which is a name sitting under the Back button until the selection changes
 * again. Each label puts itself in here when it mounts and takes itself out
 * when it goes, so there is no window in which one exists and is unknown.
 */
const labelEls = new Map<string, HTMLElement>();

/** out of the frame and out of the way of anything under it */
function hide(el: HTMLElement) {
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
}

/** applies the drag/zoom to the graph, damped, so it never snaps */
function Rig({ spin }: { spin: React.MutableRefObject<{ yaw: number; pitch: number; zoom: number }> }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const cur = useRef({ yaw: 0.4, pitch: -0.2, zoom: 1 });
  useFrame((_, delta) => {
    const g = scene.getObjectByName('atlas-graph');
    const k = 1 - Math.pow(0.001, Math.min(delta, 0.1) / 0.28);
    cur.current.yaw += (spin.current.yaw - cur.current.yaw) * k;
    cur.current.pitch += (spin.current.pitch - cur.current.pitch) * k;
    cur.current.zoom += (spin.current.zoom - cur.current.zoom) * k;
    if (g) g.rotation.set(cur.current.pitch, cur.current.yaw, 0);
    camera.position.z = 40 * cur.current.zoom;
  });
  return null;
}

/**
 * The DOM label layer. One absolutely-positioned span per named node, moved by
 * the frame loop above via `data-atlas-label`.
 */
function LabelLayer({ graph, focus }: { graph: AtlasGraph; focus: string | null }) {
  const found = useAtlas((s) => s.found);
  const selected = useAtlas((s) => s.selected);
  const select = useAtlas((s) => s.select);

  /*
   * WHICH NAMES ARE WORTH SHOWING AT ONCE
   *
   * A hundred and thirty nodes, every found one carrying a name, is a page of
   * overlapping type with a diagram somewhere underneath it — and it gets
   * worse the more you discover, which is exactly backwards. So the layer
   * thins itself:
   *
   *   nothing focused   only the hubs — the nodes with three or more found
   *                     connections — which is the shape of the collection
   *                     rather than its inventory
   *   something focused that node and everything it touches, and nothing else
   *
   * Painting nodes never carry a standing label: there are seventy of them and
   * their titles are the longest strings in the graph.
   */
  const shown = useMemo(() => {
    const keep = new Set<string>();
    if (focus) {
      keep.add(focus);
      for (const l of graph.around.get(focus) ?? []) {
        if (!found.has(linkKey(l))) continue;
        keep.add(l.a === focus ? l.b : l.a);
      }
      return keep;
    }
    for (const n of graph.nodes) {
      if (!found.has(n.id) || n.kind === 'work') continue;
      const degree = (graph.around.get(n.id) ?? []).filter((l) => found.has(linkKey(l))).length;
      if (degree >= 4) keep.add(n.id);
    }
    return keep;
  }, [graph, found, focus]);

  return (
    <div className="atlas-labels" aria-hidden={false}>
      {graph.nodes.map((n) => {
        if (!found.has(n.id) || !shown.has(n.id)) return null;
        return (
          <AtlasLabel key={n.id} node={n} on={selected === n.id} onPick={() => select(n.id)} />
        );
      })}
    </div>
  );
}

/**
 * One projected name.
 *
 * It arrives hidden and stays hidden until the frame loop has a screen
 * position for it, so a label is never seen at the origin on the frame it
 * mounts.
 */
function AtlasLabel({
  node,
  on,
  onPick,
}: {
  node: AtlasNode;
  on: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    hide(el);
    labelEls.set(node.id, el);
    return () => {
      labelEls.delete(node.id);
    };
  }, [node.id]);

  return (
    <button
      ref={ref}
      className={`atlas-label caption ${on ? 'is-on' : ''}`}
      style={{ color: KIND_COLOUR[node.kind] }}
      onClick={onPick}
    >
      {node.label}
    </button>
  );
}
