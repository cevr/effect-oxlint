// noInterruptibleMemo's message, held to what each memoizer does with a run
// its first caller left, on effect 4.0.0 and on the effect these tests install
// (4.0.1 and later behave alike). The first run never finishes; a later run
// answers its own number at once. A caller is told its outcome: its number,
// the interruption given back, or its own 100 ms timeout.
import { describe, expect, test } from "bun:test";

import type * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";

import { type Release, first, installed, runOn } from "./support/effect-releases.js";

type Memo = (
  release: Release,
  load: Effect.Effect<number>,
) => Effect.Effect<readonly [Effect.Effect<number>, Effect.Effect<void>]>;

/** Keeps an interrupted exit for no time, any other for five minutes. */
const dropInterrupted =
  (release: Release) =>
  (exit: Exit.Exit<number>): number | "5 minutes" => {
    if (release.Exit.hasInterrupts(exit)) return 0;
    return "5 minutes";
  };

const memos = {
  cached: (release, load) =>
    release.Effect.map(release.Effect.cached(load), (run) => [run, release.Effect.void] as const),
  "cachedWithTTL 50 millis": (release, load) =>
    release.Effect.map(
      release.Effect.cachedWithTTL(load, "50 millis"),
      (run) => [run, release.Effect.void] as const,
    ),
  "cachedWithTTL 1 hour": (release, load) =>
    release.Effect.map(
      release.Effect.cachedWithTTL(load, "1 hour"),
      (run) => [run, release.Effect.void] as const,
    ),
  "cachedWithTTL (interrupted: 0)": (release, load) =>
    release.Effect.map(
      release.Effect.cachedWithTTL(load, dropInterrupted(release)),
      (run) => [run, release.Effect.void] as const,
    ),
  "cachedInvalidateWithTTL 1 hour": (release, load) =>
    release.Effect.cachedInvalidateWithTTL(load, "1 hour"),
} satisfies Record<string, Memo>;

/** A caller's outcome: its number, the interruption given back, or its own timeout. */
const outcomeOf =
  (release: Release) =>
  (exit: Exit.Exit<number, unknown>): string => {
    if (release.Exit.isSuccess(exit)) return `run ${exit.value}`;
    const text = release.Cause.pretty(exit.cause);
    if (release.Exit.hasInterrupts(exit)) return "interrupted";
    if (text.includes("TimeoutError")) return "waited";
    return "failed";
  };

/** The second caller's outcome, and a later caller's: 150 ms on, or after the invalidate. */
const callers = (release: Release, memo: Memo): Effect.Effect<readonly [string, string]> => {
  const outcome = outcomeOf(release);
  let runs = 0;
  const load = release.Effect.suspend(() => {
    runs += 1;
    if (runs === 1) return release.Effect.never;
    return release.Effect.succeed(runs);
  });
  return release.Effect.gen(function* () {
    const [run, invalidate] = yield* memo(release, load);
    const firstCaller = yield* release.Effect.forkChild(run);
    yield* release.Effect.sleep("20 millis");
    yield* release.Fiber.interrupt(firstCaller);
    yield* release.Effect.sleep("5 millis");
    const second = yield* release.Effect.exit(release.Effect.timeout(run, "100 millis"));
    yield* invalidate;
    yield* release.Effect.sleep("150 millis");
    const later = yield* release.Effect.exit(release.Effect.timeout(run, "100 millis"));
    return [outcome(second), outcome(later)] as const;
  });
};

/** Every memoizer's two outcomes on one release, all at once. */
const outcomes = (release: Release): Promise<Readonly<Record<string, readonly [string, string]>>> =>
  runOn(
    release,
    release.Effect.map(
      release.Effect.forEach(
        Object.entries(memos),
        ([name, memo]) =>
          release.Effect.map(callers(release, memo), (found) => [name, found] as const),
        { concurrency: "unbounded" },
      ),
      (found) => Object.fromEntries(found),
    ),
  );

describe("noInterruptibleMemo's account of a left run", () => {
  test("on effect 4.0.0 later callers get the first caller's interruption back while the entry lives", () =>
    expect(outcomes(first)).resolves.toEqual({
      cached: ["interrupted", "interrupted"],
      "cachedWithTTL 50 millis": ["interrupted", "run 2"],
      "cachedWithTTL 1 hour": ["interrupted", "interrupted"],
      "cachedWithTTL (interrupted: 0)": ["run 2", "run 2"],
      "cachedInvalidateWithTTL 1 hour": ["interrupted", "run 2"],
    }));

  test("from effect 4.0.1 the next caller starts a new run", () =>
    expect(outcomes(installed)).resolves.toEqual({
      cached: ["run 2", "run 2"],
      "cachedWithTTL 50 millis": ["run 2", "run 3"],
      "cachedWithTTL 1 hour": ["run 2", "run 2"],
      "cachedWithTTL (interrupted: 0)": ["run 2", "run 2"],
      "cachedInvalidateWithTTL 1 hour": ["run 2", "run 3"],
    }));
});
