/**
 * Fitting a work to the space it hangs in.
 *
 * Paintings do not share proportions. A Sargent full-length is twice as tall
 * as it is wide; a Chinese handscroll section is three times wider than it is
 * tall. Hanging everything at one fixed height means the wide ones run into
 * their neighbours and off the end of the bay, so the height gives way once
 * the width would exceed what the wall can hold.
 */
export function fitWork(
  aspect: number,
  maxHeight: number,
  maxWidth: number,
): { width: number; height: number } {
  const height = Math.min(maxHeight, maxWidth / Math.max(0.05, aspect));
  return { width: height * aspect, height };
}
