import * as fs from "node:fs";

import * as Effect from "effect/Effect";

beforeEach(() => Effect.void);

export async function invalidProgram(condition: boolean) {
  try {
    await fetch("https://example.com");
    const promise = Promise.resolve(new Promise(() => undefined));
    const selected = condition ? Effect.Do : Effect.bind;
    const dynamic = import("./lazy-module.js").then((moduleNamespace) => moduleNamespace.value);
    console.log(Date.now(), Math.random(), crypto.randomUUID(), Bun.file("fixture"));
    if (fs.existsSync("fixture")) {
      throw new Error("expected failure");
    }
    return [promise, selected, dynamic];
  } finally {
    Effect.log("cleanup");
  }
}

export const nativeFailure = Effect.fail(new Error("typed channel"));
export const assertedFailure = nativeFailure as Effect.Effect<never, Error>;
export const assertedLiteral = { enabled: true } as const;
export const tracedGenerator = Effect.gen(function* () {
  return yield* Effect.void;
}).pipe(Effect.withSpan("Fixture.tracedGenerator"));
export const transformedTracedGenerator = Effect.gen(function* () {
  return yield* Effect.void;
}).pipe(Effect.asVoid, Effect.withSpan("Fixture.transformedTracedGenerator"));
export const absent = null;
export const missing = undefined;
export type Absent = null;
export type Missing = undefined;
