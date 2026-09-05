/**
 * The atlas — the collection as a graph, uncovered rather than given.
 *
 * Seventy paintings in seven buildings have, until now, had nothing to do with
 * one another: you saw ten, went back to the front door, and saw ten more.
 * They are in fact one story — Velázquez taught Manet how to put paint down,
 * Van Gogh copied Hiroshige in Arles, Ingres was David's pupil and Raphael's
 * disciple, and Caillebotte bought the Impressionists and left them to France
 * — and this is that story as a shape you can turn around.
 *
 * NOTHING IS GIVEN AT THE START
 *   The map opens nearly empty: what you have seen, and no more. Every other
 *   node is a mote with no name. Connections appear when you find the words
 *   that carry them — pull a thread out of a painting and, if the passage
 *   names a place the painter worked or a painter they knew, that edge
 *   appears. The corpus is a real corpus, so those words are really in there;
 *   the fallback below is for the passages where they are not.
 *
 * WHERE THE DATA LIVES
 *   `public/atlas.json`, authored by hand and checked in — it is not derived
 *   from anything, so unlike the corpora and the glyph binaries there is
 *   nothing for `build:assets` to regenerate, and it should not be able to go
 *   missing because somebody has not run a build.
 *
 * WHAT IS PERSISTED
 *   Only a set of ids, in localStorage. It is a record of what you have
 *   found, and it is the reason the exhibition is worth coming back to.
 */
import { create } from 'zustand';
import { asset } from '../lib/asset';

export type AtlasKind = 'painter' | 'place' | 'movement' | 'event' | 'work';

export interface AtlasEntity {
  id: string;
  kind: Exclude<AtlasKind, 'work'>;
  label: string;
  note?: string;
}

export interface AtlasLink {
  a: string;
  b: string;
  kind: string;
  /** the word in a corpus that gives this connection away */
  word?: string;
  /** what actually happened between these two — the point of the whole map */
  note?: string;
}

export interface AtlasFile {
  entities: AtlasEntity[];
  /** artwork id → painter id */
  works: Record<string, string>;
  links: AtlasLink[];
}

export interface AtlasNode {
  id: string;
  kind: AtlasKind;
  label: string;
  note?: string;
  /** for work nodes: the artwork id and which museum hangs it */
  artwork?: string;
  museum?: string;
}

export interface AtlasGraph {
  nodes: AtlasNode[];
  links: AtlasLink[];
  byId: Map<string, AtlasNode>;
  /** node id → the links touching it */
  around: Map<string, AtlasLink[]>;
}

const KEY = 'placard.found';

function loadFound(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFound(s: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* private windows are not an error here */
  }
}

/** a stable key for an edge, whichever way round it is named */
export const linkKey = (l: AtlasLink) => (l.a < l.b ? `${l.a}~${l.b}` : `${l.b}~${l.a}`);

interface AtlasStore {
  open: boolean;
  graph: AtlasGraph | null;
  /** ids of found nodes AND found links, in one set */
  found: Set<string>;
  /** the last thing uncovered, for the toast */
  latest: { label: string; kind: string } | null;
  selected: string | null;
  setOpen: (o: boolean) => void;
  setGraph: (g: AtlasGraph) => void;
  select: (id: string | null) => void;
  /** mark nodes/links found; returns the ones that were new */
  find: (ids: string[], latest?: { label: string; kind: string }) => string[];
  clearLatest: () => void;
}

export const useAtlas = create<AtlasStore>()((set, get) => ({
  open: false,
  graph: null,
  found: loadFound(),
  latest: null,
  selected: null,
  setOpen: (open) => set({ open, ...(open ? {} : { selected: null }) }),
  setGraph: (graph) => set({ graph }),
  select: (selected) => set({ selected }),
  find: (ids, latest) => {
    const found = new Set(get().found);
    const fresh = ids.filter((i) => !found.has(i));
    if (!fresh.length) return [];
    fresh.forEach((i) => found.add(i));
    saveFound(found);
    set({ found, ...(latest ? { latest } : {}) });
    return fresh;
  },
  clearLatest: () => set({ latest: null }),
}));

/* ── building the graph ─────────────────────────────────────────────────── */

let loading: Promise<AtlasGraph> | null = null;

/** "vangogh-starry-night-rhone" → "Vangogh Starry Night Rhone", until the
 *  museum manifests arrive with the real title */
const provisional = (id: string) =>
  id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Fetch the authored atlas and fold the collection into it: one node per
 * painting, wired to whoever painted it. The works are not listed in the JSON
 * with their titles because the museum manifests already carry those — but
 * this cannot WAIT for five manifests, because discovery starts the moment
 * somebody walks into a room and the graph has to be there to record it. So
 * the work nodes are built from the id alone and given their real titles
 * later, by `hydrateWorks`, when a manifest happens to be in hand.
 */
export function loadAtlas(): Promise<AtlasGraph> {
  if (loading) return loading;
  loading = fetch(asset('atlas.json'))
    .then((r) => r.json() as Promise<AtlasFile>)
    .then((file) => {
      const nodes: AtlasNode[] = file.entities.map((e) => ({ ...e }));
      const links: AtlasLink[] = [...file.links];

      for (const [artwork, painter] of Object.entries(file.works)) {
        const id = `w:${artwork}`;
        nodes.push({ id, kind: 'work', label: provisional(artwork), artwork });
        links.push({ a: id, b: painter, kind: 'painted by' });
      }

      const byId = new Map(nodes.map((n) => [n.id, n]));
      const around = new Map<string, AtlasLink[]>();
      for (const l of links) {
        if (!byId.has(l.a) || !byId.has(l.b)) continue;
        for (const end of [l.a, l.b]) {
          const list = around.get(end);
          if (list) list.push(l);
          else around.set(end, [l]);
        }
      }
      const graph: AtlasGraph = { nodes, links, byId, around };
      useAtlas.getState().setGraph(graph);
      return graph;
    });
  return loading;
}

/**
 * Give the work nodes their real titles, painters and museums. Called with
 * whatever manifests have been loaded; safe to call repeatedly, and a museum
 * nobody has opened simply keeps its provisional name until they do.
 */
export function hydrateWorks(
  works: Array<{ id: string; title: string; artist: string; museum: string }>,
) {
  const graph = useAtlas.getState().graph;
  if (!graph) return;
  let changed = false;
  for (const w of works) {
    const n = graph.byId.get(`w:${w.id}`);
    if (!n || n.museum === w.museum) continue;
    n.label = w.title;
    n.note = w.artist;
    n.museum = w.museum;
    changed = true;
  }
  // the graph object is mutated in place — the store holds the same instance,
  // so nudge it so anything rendering labels picks the new ones up
  if (changed) useAtlas.setState({ graph: { ...graph } });
}

/* ── discovery ──────────────────────────────────────────────────────────── */

/** standing in front of a painting is enough to know it, and who made it */
export function discoverWork(artworkId: string) {
  const { graph, find } = useAtlas.getState();
  if (!graph) return;
  const id = `w:${artworkId}`;
  const node = graph.byId.get(id);
  if (!node) return;
  const painterLink = (graph.around.get(id) ?? []).find((l) => l.kind === 'painted by');
  const ids = [id];
  if (painterLink) {
    ids.push(painterLink.a === id ? painterLink.b : painterLink.a, linkKey(painterLink));
  }
  find(ids);
}

/**
 * A thread has been pulled. Read it for the words that give connections away.
 *
 * Only connections belonging to this painting's painter are in play — a
 * passage about Paris in a Monet should not light up Ingres — and if the
 * passage names none of them, one connection is uncovered anyway. Never
 * finding anything is worse than finding something slightly arbitrary: the
 * corpora were written as history, not as a key to this graph, and a visitor
 * pulling threads deserves the map to grow.
 */
export function discoverFromText(artworkId: string, text: string): AtlasLink | null {
  const { graph, found, find } = useAtlas.getState();
  if (!graph) return null;
  const workId = `w:${artworkId}`;
  const painterLink = (graph.around.get(workId) ?? []).find((l) => l.kind === 'painted by');
  const painter = painterLink ? (painterLink.a === workId ? painterLink.b : painterLink.a) : null;
  if (!painter) return null;

  const candidates = (graph.around.get(painter) ?? []).filter(
    (l) => l.kind !== 'painted by' && !found.has(linkKey(l)),
  );
  if (!candidates.length) return null;

  const hay = text.toLowerCase();
  const named = candidates.find((l) => l.word && hay.includes(l.word.toLowerCase()));
  const link = named ?? candidates[0];
  const other = link.a === painter ? link.b : link.a;
  const node = graph.byId.get(other);
  find([painter, other, linkKey(link)], node ? { label: node.label, kind: link.kind } : undefined);
  return link;
}
