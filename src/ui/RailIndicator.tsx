/** Rail indicator — spec §10C.6. Hairline ticks; clicking a tick jumps the rail. */
import { useStore } from '../state/store';

export function RailIndicator() {
  const phase = useStore((s) => s.phase);
  const artworks = useStore((s) => s.artworks);
  const index = useStore((s) => s.index);
  const setIndex = useStore((s) => s.setIndex);

  if (phase !== 'gallery' || !artworks.length) return null;

  const surname = (artist: string) => artist.split(' ').slice(-1)[0].toUpperCase();

  return (
    <nav className="rail" aria-label="Artworks">
      <div className="rail-ticks">
        {artworks.map((a, i) => (
          <button
            key={a.id}
            className={`rail-tick ${i === index ? 'is-active' : ''}`}
            aria-label={`${a.artist} — ${a.title}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
      <p className="caption rail-label">{surname(artworks[index].artist)}</p>
    </nav>
  );
}
