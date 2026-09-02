/**
 * Ornate frame geometry.
 *
 * The first iteration hung every canvas in the same flat gilt box, which is
 * the one thing no real gallery does — a museum frame is a stack of turned
 * mouldings, each course catching light at a different angle, and that
 * layering is most of what makes a wall of paintings look like a wall of
 * paintings.
 *
 * A frame here is a set of concentric extruded rings ("courses"), each with
 * its own radial width, depth, bevel and material role, optionally carrying
 * a bead course, corner cartouches, or reeding. Courses are merged by
 * material before they reach the GPU, so an elaborate five-course frame with
 * ornament still costs three draw calls rather than twenty.
 *
 * Five styles, one per museum, modelled on what each actually hangs.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FrameKind } from '../types';

/** which material a piece of the frame belongs to */
type Role = 'gilt' | 'dark';

interface Course {
  /** distance from the sight edge (the canvas edge) outward, metres */
  offset: number;
  /** radial width of this band */
  width: number;
  /** how far it stands proud of the wall */
  depth: number;
  /** z of the band's front face */
  z: number;
  bevel: number;
  role: Role;
}

interface FrameSpec {
  courses: Course[];
  /** small spheres run around a course, at this radius — the bead course */
  bead?: { offset: number; radius: number; spacing: number; role: Role };
  /** raised blocks at the four corners */
  cartouche?: { size: number; depth: number; role: Role };
  /** repeated flutes running along the top and bottom rails */
  reeding?: { offset: number; count: number; size: number; role: Role };
  /** architectural surround: pilasters at the sides and a pediment above */
  tabernacle?: { pilaster: number; pediment: number; role: Role };
}

/**
 * All dimensions are fractions of the painting's height, so a frame keeps its
 * proportions whether it is around a Vermeer or around the Raft of the Medusa.
 */
const MEASURED: Record<FrameKind, FrameSpec> = {
  // Deep salon frame: gilt sight lip, dark cove, broad gilt ogee, bead course
  // and corner cartouches. The Louvre's densely stacked hang needs frames that
  // separate one canvas from the next at three metres.
  'louvre-salon': {
    courses: [
      { offset: 0.0, width: 0.022, depth: 0.03, z: 0.03, bevel: 0.004, role: 'gilt' },
      { offset: 0.022, width: 0.032, depth: 0.018, z: 0.012, bevel: 0.006, role: 'dark' },
      { offset: 0.054, width: 0.062, depth: 0.066, z: 0.066, bevel: 0.026, role: 'gilt' },
      { offset: 0.116, width: 0.026, depth: 0.038, z: 0.034, bevel: 0.011, role: 'dark' },
    ],
    bead: { offset: 0.05, radius: 0.009, spacing: 0.045, role: 'gilt' },
    cartouche: { size: 0.055, depth: 0.04, role: 'gilt' },
  },

  // Heavy swept gilt with a fluted cove — the National Gallery's crimson rooms
  // hang a small number of very large works in very large frames.
  'gallery-swept': {
    courses: [
      { offset: 0.0, width: 0.018, depth: 0.026, z: 0.026, bevel: 0.004, role: 'gilt' },
      { offset: 0.018, width: 0.05, depth: 0.02, z: 0.008, bevel: 0.014, role: 'gilt' },
      { offset: 0.068, width: 0.082, depth: 0.084, z: 0.084, bevel: 0.034, role: 'gilt' },
      { offset: 0.15, width: 0.022, depth: 0.04, z: 0.026, bevel: 0.006, role: 'dark' },
    ],
    reeding: { offset: 0.072, count: 26, size: 0.016, role: 'gilt' },
    cartouche: { size: 0.066, depth: 0.05, role: 'gilt' },
  },

  // Architectural tabernacle: the frame is a little building — pilasters at
  // the sides, an entablature and pediment above, a predella below.
  'vatican-tabernacle': {
    courses: [
      { offset: 0.0, width: 0.02, depth: 0.028, z: 0.028, bevel: 0.004, role: 'gilt' },
      { offset: 0.02, width: 0.036, depth: 0.016, z: 0.008, bevel: 0.008, role: 'dark' },
      { offset: 0.056, width: 0.044, depth: 0.05, z: 0.05, bevel: 0.018, role: 'gilt' },
    ],
    tabernacle: { pilaster: 0.075, pediment: 0.12, role: 'gilt' },
    bead: { offset: 0.045, radius: 0.008, spacing: 0.04, role: 'gilt' },
  },

  // Slim reeded gilt — the frame the impressionists actually used, and a
  // deliberate contrast with the Salon frames two museums away.
  'orsay-reeded': {
    courses: [
      { offset: 0.0, width: 0.014, depth: 0.02, z: 0.02, bevel: 0.003, role: 'gilt' },
      { offset: 0.014, width: 0.052, depth: 0.05, z: 0.05, bevel: 0.021, role: 'gilt' },
      { offset: 0.066, width: 0.014, depth: 0.022, z: 0.018, bevel: 0.004, role: 'gilt' },
    ],
    reeding: { offset: 0.03, count: 34, size: 0.012, role: 'gilt' },
  },

  // Broad, flat-topped, stepped: the American gilt frame, generous and plain,
  // reading well under the Met court's warm spotlights.
  'met-broad': {
    courses: [
      { offset: 0.0, width: 0.02, depth: 0.024, z: 0.024, bevel: 0.004, role: 'dark' },
      { offset: 0.02, width: 0.07, depth: 0.062, z: 0.062, bevel: 0.026, role: 'gilt' },
      { offset: 0.09, width: 0.03, depth: 0.03, z: 0.03, bevel: 0.006, role: 'gilt' },
      { offset: 0.12, width: 0.018, depth: 0.05, z: 0.05, bevel: 0.005, role: 'gilt' },
    ],
    bead: { offset: 0.105, radius: 0.007, spacing: 0.038, role: 'gilt' },
  },
};

/**
 * Frames are for the painting, not the other way round.
 *
 * The first version of these mouldings was drawn from real salon frames,
 * which on a real wall are seen from four metres in a room full of other
 * things. On a screen, at the one distance the camera ever stands, the same
 * proportions read as a slab of gilt with a picture in the middle of it — the
 * ornament wins and the painting loses, which is exactly backwards.
 *
 * So every course is narrowed radially while keeping most of its depth. The
 * frame still steps and still catches light across four or five planes, which
 * is what makes it read as carved rather than printed; it simply takes a
 * third less of the canvas's height doing it. The numbers below stay as
 * measured from the real thing, so the reference is still legible in the
 * source, and this is the one place the compromise is stated.
 */
const SLIM = {
  /** radial width and offset — how much of the painting the frame eats */
  radial: 0.7,
  /** relief off the wall, kept high so the mouldings still turn in the light */
  depth: 0.9,
  ornament: 0.78,
};

function slim(spec: FrameSpec): FrameSpec {
  return {
    courses: spec.courses.map((c) => ({
      ...c,
      offset: c.offset * SLIM.radial,
      width: c.width * SLIM.radial,
      depth: c.depth * SLIM.depth,
      z: c.z * SLIM.depth,
      bevel: c.bevel * SLIM.radial,
    })),
    bead: spec.bead && {
      ...spec.bead,
      offset: spec.bead.offset * SLIM.radial,
      radius: spec.bead.radius * SLIM.ornament,
      spacing: spec.bead.spacing * SLIM.radial,
    },
    cartouche: spec.cartouche && {
      ...spec.cartouche,
      size: spec.cartouche.size * SLIM.ornament,
      depth: spec.cartouche.depth * SLIM.depth,
    },
    reeding: spec.reeding && {
      ...spec.reeding,
      offset: spec.reeding.offset * SLIM.radial,
      size: spec.reeding.size * SLIM.ornament,
    },
    tabernacle: spec.tabernacle && {
      ...spec.tabernacle,
      pilaster: spec.tabernacle.pilaster * SLIM.radial,
      pediment: spec.tabernacle.pediment * SLIM.ornament,
    },
  };
}

const SPECS: Record<FrameKind, FrameSpec> = Object.fromEntries(
  Object.entries(MEASURED).map(([k, v]) => [k, slim(v)]),
) as Record<FrameKind, FrameSpec>;

/** total outward reach of a frame, as a fraction of the painting height */
export function frameReach(kind: FrameKind): number {
  const spec = SPECS[kind];
  const courses = Math.max(...spec.courses.map((c) => c.offset + c.width));
  const tab = spec.tabernacle?.pilaster ?? 0;
  return Math.max(courses, tab);
}

/** a rectangular ring, extruded and bevelled — one course of the moulding */
function ringGeometry(
  innerW: number,
  innerH: number,
  width: number,
  depth: number,
  bevel: number,
): THREE.BufferGeometry {
  const outerW = innerW + width * 2;
  const outerH = innerH + width * 2;

  const shape = new THREE.Shape();
  shape.moveTo(-outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, outerH / 2);
  shape.lineTo(-outerW / 2, outerH / 2);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-innerW / 2, -innerH / 2);
  hole.lineTo(-innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, -innerH / 2);
  hole.closePath();
  shape.holes.push(hole);

  // the bevel is what turns a flat band into a moulding that catches light
  const b = Math.min(bevel, width * 0.42, depth * 0.42);
  return new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - b * 2),
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 1,
  });
}

function transformed(
  geo: THREE.BufferGeometry,
  m: THREE.Matrix4,
): THREE.BufferGeometry {
  return geo.applyMatrix4(m);
}

export interface FrameGeometry {
  gilt: THREE.BufferGeometry | null;
  dark: THREE.BufferGeometry | null;
  /** local positions for the bead course, if the style has one */
  beads: THREE.Vector3[];
  beadRadius: number;
  beadRole: Role;
}

/**
 * Build one frame around a `width` × `height` painting whose centre is the
 * origin and whose surface sits at z = 0.
 */
export function buildFrame(
  kind: FrameKind,
  width: number,
  height: number,
  /** carve the bead course, cartouches and reeding */
  ornament = true,
): FrameGeometry {
  const spec = SPECS[kind] ?? SPECS['louvre-salon'];
  const s = height; // every dimension in the spec is a fraction of the height
  const parts: Record<Role, THREE.BufferGeometry[]> = { gilt: [], dark: [] };
  const mat = new THREE.Matrix4();

  for (const c of spec.courses) {
    const innerW = width + c.offset * s * 2;
    const innerH = height + c.offset * s * 2;
    const geo = ringGeometry(innerW, innerH, c.width * s, c.depth * s, c.bevel * s);
    // ExtrudeGeometry grows along +z from 0; push the band back so its front
    // face lands on the course's stated z
    mat.makeTranslation(0, 0, c.z * s - c.depth * s);
    parts[c.role].push(transformed(geo, mat));
  }

  // corner cartouches — raised carved blocks breaking the run of the moulding
  if (spec.cartouche && ornament) {
    const outer = Math.max(...spec.courses.map((c) => c.offset + c.width));
    const size = spec.cartouche.size * s;
    const cx = width / 2 + outer * s - size * 0.28;
    const cy = height / 2 + outer * s - size * 0.28;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const geo = new THREE.BoxGeometry(size, size, spec.cartouche.depth * s);
        mat.makeRotationZ(Math.PI / 4);
        mat.setPosition(sx * cx, sy * cy, (spec.cartouche.depth * s) / 2);
        parts[spec.cartouche.role].push(transformed(geo, mat));
      }
    }
  }

  // reeding — the repeated flutes running along the rails
  if (spec.reeding && ornament) {
    const r = spec.reeding;
    const size = r.size * s;
    const along = (length: number, count: number) =>
      Array.from({ length: count }, (_, i) => (i / (count - 1) - 0.5) * length);

    const railY = height / 2 + r.offset * s;
    const railX = width / 2 + r.offset * s;
    const nX = Math.max(3, Math.round((r.count * width) / height));
    for (const x of along(width * 0.94, nX)) {
      for (const sy of [-1, 1]) {
        const geo = new THREE.BoxGeometry(size * 0.4, size, size * 0.9);
        mat.makeTranslation(x, sy * railY, size * 0.45);
        parts[r.role].push(transformed(geo, mat));
      }
    }
    for (const y of along(height * 0.94, r.count)) {
      for (const sx of [-1, 1]) {
        const geo = new THREE.BoxGeometry(size, size * 0.4, size * 0.9);
        mat.makeTranslation(sx * railX, y, size * 0.45);
        parts[r.role].push(transformed(geo, mat));
      }
    }
  }

  // tabernacle — pilasters, entablature, pediment, predella
  if (spec.tabernacle) {
    const t = spec.tabernacle;
    const pw = t.pilaster * s;
    const outer = Math.max(...spec.courses.map((c) => c.offset + c.width)) * s;
    const px = width / 2 + outer + pw / 2;
    const ph = height + outer * 2;

    for (const sx of [-1, 1]) {
      // shaft
      const shaft = new THREE.BoxGeometry(pw, ph, pw * 0.7);
      mat.makeTranslation(sx * px, 0, pw * 0.35);
      parts[t.role].push(transformed(shaft, mat));
      // capital and base
      for (const sy of [-1, 1]) {
        const cap = new THREE.BoxGeometry(pw * 1.45, pw * 0.55, pw * 0.95);
        mat.makeTranslation(sx * px, (sy * ph) / 2, pw * 0.45);
        parts[t.role].push(transformed(cap, mat));
      }
    }

    const totalW = width + outer * 2 + pw * 2;
    // entablature
    const ent = new THREE.BoxGeometry(totalW * 1.04, t.pediment * s * 0.42, pw * 1.05);
    mat.makeTranslation(0, ph / 2 + pw * 0.28 + t.pediment * s * 0.21, pw * 0.5);
    parts[t.role].push(transformed(ent, mat));
    // Pediment — an extruded triangle. A 3-sided cylinder is cheaper but has
    // to be rotated into place on two axes, and the composed rotation leaves
    // the gable leaning across the frame instead of sitting square on it.
    const halfSpan = totalW * 0.52;
    const rise = t.pediment * s * 0.62;
    const tri = new THREE.Shape();
    tri.moveTo(-halfSpan, 0);
    tri.lineTo(halfSpan, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    const ped = new THREE.ExtrudeGeometry(tri, { depth: pw * 0.85, bevelEnabled: false });
    mat.makeTranslation(0, ph / 2 + pw * 0.28 + t.pediment * s * 0.42, pw * 0.05);
    parts[t.role].push(transformed(ped, mat));
    // predella
    const pred = new THREE.BoxGeometry(totalW, t.pediment * s * 0.3, pw * 1.05);
    mat.makeTranslation(0, -ph / 2 - pw * 0.28 - t.pediment * s * 0.15, pw * 0.5);
    parts[t.role].push(transformed(pred, mat));
  }

  // bead course positions (drawn as one instanced mesh by the component)
  const beads: THREE.Vector3[] = [];
  let beadRadius = 0.01;
  let beadRole: Role = 'gilt';
  if (spec.bead && ornament) {
    beadRadius = spec.bead.radius * s;
    beadRole = spec.bead.role;
    const bx = width / 2 + spec.bead.offset * s;
    const by = height / 2 + spec.bead.offset * s;
    const step = spec.bead.spacing * s;
    const nX = Math.max(2, Math.round((bx * 2) / step));
    const nY = Math.max(2, Math.round((by * 2) / step));
    for (let i = 0; i <= nX; i++) {
      const x = -bx + (i / nX) * bx * 2;
      beads.push(new THREE.Vector3(x, by, beadRadius * 0.7));
      beads.push(new THREE.Vector3(x, -by, beadRadius * 0.7));
    }
    for (let i = 1; i < nY; i++) {
      const y = -by + (i / nY) * by * 2;
      beads.push(new THREE.Vector3(bx, y, beadRadius * 0.7));
      beads.push(new THREE.Vector3(-bx, y, beadRadius * 0.7));
    }
  }

  const merge = (list: THREE.BufferGeometry[]) => {
    if (!list.length) return null;
    // The courses are ExtrudeGeometry (non-indexed) and the ornament is boxes,
    // cylinders and spheres (indexed). mergeGeometries requires the whole set
    // to agree on both indexing and the attribute list, so flatten everything
    // to non-indexed and normalise the attributes before merging.
    const flat = list.map((g) => {
      const n = g.getIndex() ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      n.deleteAttribute('uv1');
      n.deleteAttribute('uv2');
      if (!n.getAttribute('uv')) {
        const count = n.getAttribute('position').count;
        n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      return n;
    });
    const merged = mergeGeometries(flat, false);
    for (const g of flat) g.dispose();
    return merged;
  };

  return {
    gilt: merge(parts.gilt),
    dark: merge(parts.dark),
    beads,
    beadRadius,
    beadRole,
  };
}
