/** Loading — spec §10C.8. No spinners: a 1px gilt rule fills across the bottom. */
export function LoadingBar({ progress }: { progress: number }) {
  return (
    <div className="loading" role="status" aria-label="Preparing the gallery">
      <p className="caption loading-word">PLACARD</p>
      <div className="loading-rule" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
