import { createHmac } from "node:crypto";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

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
const testHarness = {
  mock: () => Effect.void,
  spyOn: () => Effect.void,
};
export const validTestHarness = [testHarness.mock(), testHarness.spyOn()];
// oxlint-disable-next-line no-shadow -- verifies that the rule resolves the local binding
export const localEffectNamespace = (Effect: {
  gen: (body: () => Generator<never, void>) => {
    pipe: (...operations: ReadonlyArray<unknown>) => void;
  };
  withSpan: (name: string) => unknown;
}) => Effect.gen(function* () {}).pipe(Effect.withSpan("not-effect"));
export const wireNames = { undefined: true };
export const wireName = wireNames.undefined;

class Jobs extends Context.Service<Jobs, { readonly run: () => Effect.Effect<void> }>()(
  "oxlint-plugin-effect/tests/integration/valid/Jobs",
) {}
declare const growingEffects: ReadonlyArray<Effect.Effect<void>>;
declare const serviceLayer: Layer.Layer<never>;
export const checkedService = Layer.succeed(Jobs, Jobs.of({ run: () => Effect.void }));
export const fixedParallelWork = Effect.all([Effect.void, Effect.void], {
  concurrency: "unbounded",
});
export const boundedParallelWork = Effect.all(growingEffects, { concurrency: 4 });
export const boundedRetry = Effect.retry(Effect.fail("retry"), {
  schedule: Schedule.exponential("100 millis"),
  times: 3,
});
export const hostRuntime = ManagedRuntime.make(serviceLayer);
export type WireNames = { undefined: boolean };

type Event =
  | { readonly _tag: "Created" }
  | { readonly _tag: "Updated" }
  | { readonly _tag: "Deleted" };

declare const event: Event;
export const isCreated = event._tag === "Created";

export const recordEvent = (events: Array<string>) => {
  switch (event._tag) {
    case "Created":
      events.push("created");
      break;
    case "Updated":
      events.push("updated");
      break;
    case "Deleted":
      events.push("deleted");
      break;
  }
};

export const eventLabelWithFallback = () => {
  if (event._tag === "Created") return "created";
  else if (event._tag === "Updated") return "updated";
  else return "other";
};

const isExpectedFailure = (error: { readonly _tag: string }) => error._tag === "ExpectedFailure";
export const recoveredWithNamedPredicate = Effect.fail({ _tag: "ExpectedFailure" }).pipe(
  Effect.catchIf(isExpectedFailure, () => Effect.void),
);
