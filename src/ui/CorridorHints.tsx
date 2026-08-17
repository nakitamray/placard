/** Movement affordances, shown briefly on entering the corridor. */
import { useEffect, useState } from 'react';

export function CorridorHints() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), 7000);
    const hide = () => setVisible(false);
    window.addEventListener('keydown', hide, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', hide);
    };
  }, []);
  return (
    <div className={`corridor-hints caption ${visible ? '' : 'is-faded'}`} aria-hidden>
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd> walk
      </span>
      <span>
        <kbd>⇧</kbd> / <kbd>⏎</kbd> hurry to the end
      </span>
      <span>move the mouse to look</span>
    </div>
  );
}
