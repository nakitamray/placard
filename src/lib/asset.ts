/**
 * Where the generated assets live at runtime.
 *
 * Every artwork, museum manifest and landing background is fetched by an
 * absolute path. That works at the root of a domain and breaks the moment the
 * exhibition is served from a subpath — `https://user.github.io/placard/` —
 * because `/artworks/…` then resolves to the wrong origin root and every
 * painting 404s.
 *
 * Vite knows the deploy base at build time, so route every generated-asset URL
 * through here rather than writing a leading slash by hand.
 */
const BASE = import.meta.env.BASE_URL || '/';

export function asset(pathFromPublicRoot: string): string {
  const clean = pathFromPublicRoot.replace(/^\/+/, '');
  return `${BASE}${BASE.endsWith('/') ? '' : '/'}${clean}`;
}
