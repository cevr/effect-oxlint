import * as Arr from "effect/Array";
import * as Option from "effect/Option";

/**
 * A seeded chooser (mulberry32) for generated fixture properties: the same
 * seed builds the same cases, so a failing case names a seed that replays it.
 */
export const seededPick = (seed: number) => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return <T>(choices: ReadonlyArray<T>): T =>
    Option.getOrThrow(Arr.get(choices, Math.floor(next() * choices.length)));
};

/** `text` when `on`, else the empty string. */
export const when = (on: boolean, text: string): string => [text].filter(() => on).join("");
