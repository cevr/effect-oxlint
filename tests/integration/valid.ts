import { createHmac } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const crypto = {
  randomUUID: () => "fixture-id",
};

export const validProgram = Effect.gen(function* () {
  const moduleNamespace = yield* Effect.tryPromise(() => import("./lazy-module.js"));
  if (Option.isSome(Option.some(moduleNamespace.value))) {
    yield* Effect.log(crypto.randomUUID());
  }
  yield* Effect.as(Effect.void, createHmac("sha256", "fixture"));
  return yield* Effect.die(new Error("explicit fixture defect"));
});

export const validPolicy = { enabled: true } satisfies { enabled: boolean };
// oxlint-disable-next-line no-shadow -- verifies that the rule resolves the local binding
export const localEffectNamespace = (Effect: {
  gen: (body: () => Generator<never, void>) => {
    pipe: (...operations: ReadonlyArray<unknown>) => void;
  };
  withSpan: (name: string) => unknown;
}) => Effect.gen(function* () {}).pipe(Effect.withSpan("not-effect"));
export const wireNames = { undefined: true };
export const wireName = wireNames.undefined;
export type WireNames = { undefined: boolean };
