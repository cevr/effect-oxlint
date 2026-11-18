/**
 * Counted cost of `noSortForExtreme` (catalog SR-P02): comparisons of a sort
 * that keeps one end against one pass. Counts work, never time.
 */
import { seededPick } from "../support/seeded.js";

export interface Cost {
  readonly comparisons: number;
  readonly least: number;
}

const values = (n: number): ReadonlyArray<number> => {
  const pick = seededPick(1118);
  const range = Array.from({ length: 1000 }, (_, value) => value);
  return Array.from({ length: n }, () => pick(range));
};

/** The reported form: `[...xs].sort(compare)[0]`. */
export const sortForLeast = (n: number): Cost => {
  let comparisons = 0;
  const sorted = [...values(n)].sort((left, right) => {
    comparisons += 1;
    return left - right;
  });
  return { comparisons, least: sorted[0] ?? -1 };
};

/** The remedy: one pass that keeps the best so far. */
export const passForLeast = (n: number): Cost => {
  const xs = values(n);
  let comparisons = 0;
  let least = xs[0] ?? -1;
  for (const x of xs.slice(1)) {
    comparisons += 1;
    if (x < least) least = x;
  }
  return { comparisons, least };
};
