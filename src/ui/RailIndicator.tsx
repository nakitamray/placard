/** Rail indicator Hairline ticks; clicking a tick jumps the rail. */
import { selectArtworks, useStore } from '../state/store';

export function RailIndicator() {
  const phase = useStore((s) => s.phase);
  const artworks = useStore(selectArtworks);
  const index = useStore((s) => s.index);
  const setIndex = useStore((s) => s.setIndex);

  if (phase !== 'gallery' || !artworks.length) return null;

  // keep nobiliary particles with the surname: "Vincent van Gogh" → VAN GOGH
  const surname = (artist: string) => {
    const words = artist.split(' ');
    const particles = new Set(['van', 'de', 'du', 'da', 'della', 'la', 'le']);
    let start = words.length - 1;
    while (start > 0 && particles.has(words[start - 1].toLowerCase())) start--;
    return words.slice(start).join(' ').toUpperCase();
  };

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
