export type Direction = "up" | "down" | "left" | "right";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Candidate<T> {
  el: T;
  box: Box;
}

function centerX(box: Box): number {
  return (box.left + box.right) / 2;
}

function centerY(box: Box): number {
  return (box.top + box.bottom) / 2;
}

/**
 * Returns a cost for moving from `from` to `to` in `direction`, or null when
 * the candidate is not in that direction (or not visually on the same row /
 * column, which keeps left/right from jumping between rows).
 *
 * Geometry only: this is a fallback that works on any page, including pages
 * we have not modelled. Rows are preferred by the perpendicular penalty.
 */
export function score(
  from: Box,
  to: Box,
  direction: Direction,
): number | null {
  const dx = centerX(to) - centerX(from);
  const dy = centerY(to) - centerY(from);

  const primary =
    direction === "left"
      ? -dx
      : direction === "right"
        ? dx
        : direction === "up"
          ? -dy
          : dy;

  if (primary <= 4) return null;

  const perpendicular =
    direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);

  // Left/right must stay on the same visual row. A card in another row is
  // almost never what the user meant, even if it is horizontally closer.
  if (direction === "left" || direction === "right") {
    const sameRow = perpendicular < Math.max(from.height, to.height) * 0.55;
    if (!sameRow) return null;
  }

  // Up/down may land on a different column; keep it cheap enough to allow a
  // nearby card, but prefer the one nearest the current x.
  return primary + perpendicular * 2.5;
}

export function best<T>(
  from: Box,
  candidates: Candidate<T>[],
  direction: Direction,
): T | null {
  let bestEl: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const cost = score(from, candidate.box, direction);
    if (cost !== null && cost < bestScore) {
      bestScore = cost;
      bestEl = candidate.el;
    }
  }

  return bestEl;
}
