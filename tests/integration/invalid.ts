import * as fs from "node:fs";

import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { vi as testDouble } from "vitest";

beforeEach(() => Effect.void);
testDouble.mock("./lazy-module.js");
testDouble.spyOn(Effect, "runSync");
export const localTestDoubleIsAllowed = () => {
  // oxlint-disable-next-line no-shadow -- verifies imported test API shadowing
  const testDouble = {
    mock: () => Effect.void,
    spyOn: () => Effect.void,
  };
  return [testDouble.mock(), testDouble.spyOn()];
};

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

class Jobs extends Context.Service<Jobs, { readonly run: () => Effect.Effect<void> }>()("Jobs") {}
declare const growingEffects: ReadonlyArray<Effect.Effect<void>>;
declare const growingValues: ReadonlyArray<number>;
declare const serviceLayer: Layer.Layer<never>;

export const uncheckedService = Layer.succeed(Jobs, { run: () => Effect.void });
export const uncheckedEffectService = Layer.effect(Jobs, Effect.succeed({ run: Effect.void }));
export const allAtOnce = Effect.all(growingEffects, { concurrency: "unbounded" });
export const visitAllAtOnce = Effect.forEach(growingValues, (value) => Effect.succeed(value), {
  concurrency: "unbounded",
});
export const retryForever = Effect.retry(nativeFailure, Schedule.forever);
export const retryWithNoLimit = Effect.retry(nativeFailure, {
  schedule: Schedule.exponential("100 millis"),
});
export const nestedRuntime = Effect.gen(function* () {
  yield* Effect.void;
  return ManagedRuntime.make(serviceLayer);
});
export const unnamedOperation = Effect.fn(function* () {
  return yield* Effect.void;
});
export const inlineProvided = Effect.gen(function* () {
  return yield* Effect.void.pipe(Effect.provide(Layer.empty));
});
export const nestedGenerator = Effect.gen(function* () {
  return yield* Effect.gen(function* () {
    return yield* Effect.void;
  });
});
export const hiddenSequence = Effect.all([Effect.void, Effect.void], {
  concurrency: 1,
  discard: true,
});
export const silentRecovery = nativeFailure.pipe(Effect.catchAll(() => Effect.void));
export const perCallCache = Effect.fn("Fixture.perCallCache")(function* () {
  return yield* Cache.make({
    capacity: 10,
    lookup: (key: string) => Effect.succeed(key),
  });
});
export const collectedForever = Stream.repeat(Stream.make(1)).pipe(Stream.runCollect);
export const retriedStream = Stream.retry(Schedule.exponential("100 millis"));
export const retriedHttpClient = HttpClient.retryTransient({
  schedule: Schedule.exponential("100 millis"),
});

declare const event: { readonly _tag: "Created" | "Updated" | "Deleted" };
export const selectedEvent = event._tag === "Created" || event._tag === "Updated";

export const eventLabel = () => {
  switch (event._tag) {
    case "Created":
      return "created";
    case "Updated":
      return "updated";
    case "Deleted":
      return "deleted";
  }
};

export const recovered = nativeFailure.pipe(
  Effect.catchIf(
    (error) => error._tag === "ExpectedFailure",
    () => Effect.void,
  ),
);

export const recoveredMany = nativeFailure.pipe(
  Effect.catchIf(
    (error) => error._tag === "ExpectedFailure" || error._tag === "RetryableFailure",
    () => Effect.void,
  ),
);

type TaggedFailure = { readonly _tag: "ExpectedFailure" } | { readonly _tag: "RetryableFailure" };

declare const taggedFailure: Effect.Effect<never, TaggedFailure>;

export const recoveredByCatchAllSwitch = taggedFailure.pipe(
  Effect.catchAll((error) => {
    switch (error._tag) {
      case "ExpectedFailure":
        return Effect.void;
      case "RetryableFailure":
        return Effect.void;
    }
  }),
);

export const recoveredByCatchAllIf = taggedFailure.pipe(
  Effect.catchAll((error) => {
    if (error._tag === "ExpectedFailure") return Effect.void;
    if (error._tag === "RetryableFailure") return Effect.void;
    return Effect.fail(error);
  }),
);

export const eventLabelIf = () => {
  if (event._tag === "Created") return "created";
  else if (event._tag === "Updated") return "updated";
  else if (event._tag === "Deleted") return "deleted";
};

export const eventLabelSequentialIf = () => {
  if (event._tag === "Created") return "created";
  if (event._tag === "Updated") return "updated";
  if (event._tag === "Deleted") return "deleted";
};
