/** White flash used at the warp peak (T3→T4). Imperative, DOM-only. */
let el: HTMLDivElement | null = null;

export function FlashLayer() {
  return (
    <div
      ref={(r) => {
        el = r;
      }}
      className="flash"
      aria-hidden
    />
  );
}

export function flash(totalMs: number) {
  if (!el) return;
  const rise = Math.min(220, totalMs * 0.3);
  el.style.transition = `opacity ${rise}ms ease-in`;
  el.style.opacity = '1';
  window.setTimeout(() => {
    if (!el) return;
    el.style.transition = `opacity ${totalMs - rise}ms ease-out`;
    el.style.opacity = '0';
  }, rise + 30);
}
