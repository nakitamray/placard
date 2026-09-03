/**
 * The Atlas — fifty paintings as one shape.
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

function Graph({
  graph,
  onPick,
}: {
  graph: AtlasGraph;
  onPick: (n: AtlasNode) => void;
}) {
  const found = useAtlas((s) => s.found);
  const selected = useAtlas((s) => s.selected);
  const groupRef = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const [hover, setHover] = useState<string | null>(null);
  const { camera, size } = useThree();

  const bodies = useMemo(() => seedBodies(graph), [graph]);
  const index = useMemo(() => new Map(bodies.map((b, i) => [b.id, i])), [bodies]);
  const energy = useRef(1);

  // one geometry for every edge; only the found ones are given real endpoints
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(graph.links.length * 6), 3));
    return g;
  }, [graph]);

  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

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
          const f = 26 / d2;
          const d = Math.sqrt(d2);
          a.v.x += (dx / d) * f * dt;
          a.v.y += (dy / d) * f * dt;
          a.v.z += (dz / d) * f * dt;
          b.v.x -= (dx / d) * f * dt;
          b.v.y -= (dy / d) * f * dt;
          b.v.z -= (dz / d) * f * dt;
        }
        // a weak pull to the middle, so nothing drifts to infinity
        a.v.addScaledVector(a.p, -0.55 * dt);
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
        const f = (d - 3.4) * 1.5 * dt;
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

    // edges
    const pos = lineGeo.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    for (const l of graph.links) {
      if (!found.has(linkKey(l))) continue;
      const a = bodies[index.get(l.a)!];
      const b = bodies[index.get(l.b)!];
      if (!a || !b) continue;
      pos.setXYZ(n * 2, a.p.x, a.p.y, a.p.z);
      pos.setXYZ(n * 2 + 1, b.p.x, b.p.y, b.p.z);
      n++;
    }
    pos.needsUpdate = true;
    lineGeo.setDrawRange(0, n * 2);

    // labels, projected — written straight to the DOM, never through React
    const g = groupRef.current;
    if (g) {
      for (const b of bodies) {
        const el = labelEls.current.get(b.id);
        if (!el) continue;
        w.copy(b.p).applyMatrix4(g.matrixWorld);
        const dist = w.distanceTo(camera.position);
        v.copy(w).project(camera);
        // Fade by distance from the camera, not by NDC z. Everything here sits
        // at roughly the same clip depth — 0.97 or so — and reading opacity
        // off that left every name in the map at 13%.
        const near = Math.max(0.3, Math.min(1, 1.5 - dist / 46));
        el.style.transform = `translate(-50%, 0) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
        el.style.opacity = v.z > 1 ? '0' : String(near);
      }
    }
  });

  const v = useMemo(() => new THREE.Vector3(), []);
  const w = useMemo(() => new THREE.Vector3(), []);
  const labelEls = useRef(new Map<string, HTMLElement>());

  // hand the DOM label layer the elements to move
  useEffect(() => {
    labelEls.current = new Map();
    document.querySelectorAll<HTMLElement>('[data-atlas-label]').forEach((el) => {
      labelEls.current.set(el.dataset.atlasLabel!, el);
    });
  }, [graph, found, selected]);

  return (
    <group ref={groupRef} name="atlas-graph">
      <lineSegments ref={linesRef} geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial color="#C9A227" transparent opacity={0.32} />
      </lineSegments>
      {bodies.map((b) => {
        const node = graph.byId.get(b.id)!;
        const known = found.has(b.id);
        const r = known ? 0.15 + Math.min(0.3, b.degree * 0.022) : 0.07;
        const on = selected === b.id || hover === b.id;
        return (
          <mesh
            key={b.id}
            position={b.p}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (known) setHover(b.id);
            }}
            onPointerOut={() => setHover((h) => (h === b.id ? null : h))}
            onClick={(e) => {
              e.stopPropagation();
              if (known) onPick(node);
            }}
          >
            <sphereGeometry args={[r * (on ? 1.5 : 1), 16, 12]} />
            <meshBasicMaterial
              color={known ? KIND_COLOUR[node.kind] : '#6E5B4A'}
              transparent
              opacity={known ? (on ? 1 : 0.9) : 0.3}
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
  const drag = useRef<{ x: number; y: number } | null>(null);

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
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          spin.current.yaw += (e.clientX - drag.current.x) * 0.006;
          spin.current.pitch += (e.clientY - drag.current.y) * 0.006;
          spin.current.pitch = Math.max(-1.2, Math.min(1.2, spin.current.pitch));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
        onWheel={(e) => {
          spin.current.zoom = Math.max(0.45, Math.min(2.4, spin.current.zoom * (1 + e.deltaY * 0.0012)));
        }}
      >
        <Canvas camera={{ fov: 45, position: [0, 0, 34], near: 0.1, far: 200 }} dpr={[1, 1.75]}>
          <Rig spin={spin} />
          {graph && (
            <Graph
              graph={graph}
              onPick={(n) => {
                select(n.id);
                sfx.link();
              }}
            />
          )}
        </Canvas>
        {graph && <LabelLayer graph={graph} />}
      </div>

      <header className="atlas-head">
        <div>
          <p className="caption atlas-eyebrow">The atlas</p>
          <h2 className="display atlas-title">How the fifty are joined</h2>
        </div>
        <button className="caption atlas-close" onClick={() => setOpen(false)}>
          Close ✕
        </button>
      </header>

      <p className="caption atlas-progress">
        {foundLinks} of {totalLinks} connections found · pull threads out of the paintings to
        uncover more
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
            <button className="caption atlas-enter" onClick={() => void enter(node.artwork!, node.museum!)}>
              Walk into this room →
            </button>
          )}
          <ul className="atlas-edges">
            {edges.map((l) => {
              const otherId = l.a === node.id ? l.b : l.a;
              const other = graph?.byId.get(otherId);
              if (!other) return null;
              return (
                <li key={linkKey(l)}>
                  <button className="atlas-edge" onClick={() => select(otherId)}>
                    <span className="caption atlas-edge-kind">{l.kind}</span>
                    <span className="atlas-edge-name">{other.label}</span>
                  </button>
                </li>
              );
            })}
            {!edges.length && (
              <li className="caption atlas-empty">
                Nothing found yet. Pull a thread out of one of their paintings.
              </li>
            )}
          </ul>
        </aside>
      )}
    </div>
  );
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
    camera.position.z = 34 * cur.current.zoom;
  });
  return null;
}

/**
 * The DOM label layer. One absolutely-positioned span per named node, moved by
 * the frame loop above via `data-atlas-label`.
 */
function LabelLayer({ graph }: { graph: AtlasGraph }) {
  const found = useAtlas((s) => s.found);
  const selected = useAtlas((s) => s.selected);
  const select = useAtlas((s) => s.select);
  return (
    <div className="atlas-labels" aria-hidden={false}>
      {graph.nodes.map((n) => {
        if (!found.has(n.id)) return null;
        if (n.kind === 'work' && selected !== n.id) return null;
        return (
          <button
            key={n.id}
            data-atlas-label={n.id}
            className={`atlas-label caption ${selected === n.id ? 'is-on' : ''}`}
            style={{ color: KIND_COLOUR[n.kind] }}
            onClick={() => select(n.id)}
          >
            {n.label}
          </button>
        );
      })}
    </div>
  );
}
