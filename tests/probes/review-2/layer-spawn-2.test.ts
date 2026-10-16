import { describe, it, layer } from "@effect/vitest";
import { it as bit } from "effect-bun-test";
import { Effect, Layer } from "effect";
import { ChildProcess } from "effect/process";

declare const TestLayer: Layer.Layer<never>;

// P1: @effect/vitest's top-level layer block; the inner test names no timeout.
layer(TestLayer)("top-level layer", (it) => {
  it.effect("status runs", () =>
    Effect.gen(function* () {
      yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
    }),
  );
});

// P2: it.layer block; the inner test names no timeout (a true report, but where?).
it.layer(TestLayer)("it.layer, inner test with no timeout", (it) => {
  it.effect("status runs", () =>
    Effect.gen(function* () {
      yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
    }),
  );
});

// P3: effect-bun-test's it.effect.layer test, naming its timeout: must stay clear.
bit.effect.layer(TestLayer)(
  "bun layer test with a timeout",
  () =>
    Effect.gen(function* () {
      yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
    }),
  30_000,
);

// P4: the same with no timeout: a true report.
bit.effect.layer(TestLayer)("bun layer test with no timeout", () =>
  Effect.gen(function* () {
    yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
  }),
);

// P5: a describe that sets its tests' timeout; the test names none of its own.
describe("group timeout", { timeout: 30_000 }, () => {
  it("spawns", () => {
    Bun.spawnSync(["true"]);
  });
});
