/**
 * Where the wall label should sit, in screen pixels.
 *
 * The gallery writes it every frame — the projected right-hand edge of the
 * active canvas — and the DOM placard reads it. One shared mutable object
 * rather than state, because it changes sixty times a second and nothing
 * about it should cause a React render.
 *
 * It lives in a module of its own, away from the scene that writes it, so
 * that the placard can read it without importing the gallery. The gallery is
 * the largest room in the exhibition and it is loaded on demand; a
 * three-field object reaching into it from a component that is always on
 * screen was enough to pull the whole thing back into the entrance's bundle.
 */
export const placardAnchor = { x: 0, y: 0, edge: 0, visible: false };
