/**
 * Counted cost of `noRepeatedPass` (catalog SR-P04): callback calls of three
 * `filter` passes over one array against one loop that fills all three
 * results. Counts work, never time.
 */
export interface Cost {
  readonly calls: number;
  readonly sizes: readonly [number, number, number];
}

const scores = (n: number): ReadonlyArray<number> =>
  Array.from({ length: n }, (_, index) => (index * 37) % 100);

/** The reported form: three passes over `scores`. */
export const threePasses = (n: number): Cost => {
  const xs = scores(n);
  let calls = 0;
  const count = (x: number, keep: boolean): boolean => {
    calls += 1;
    return keep;
  };
  const low = xs.filter((x) => count(x, x < 30));
  const middle = xs.filter((x) => count(x, x >= 30 && x < 70));
  const high = xs.filter((x) => count(x, x >= 70));
  return { calls, sizes: [low.length, middle.length, high.length] };
};

/** The remedy: one loop. */
export const onePass = (n: number): Cost => {
  let calls = 0;
  const sizes: [number, number, number] = [0, 0, 0];
  for (const x of scores(n)) {
    calls += 1;
    const bucket = Number(x >= 30) + Number(x >= 70);
    sizes[bucket] = (sizes[bucket] ?? 0) + 1;
  }
  return { calls, sizes };
};
