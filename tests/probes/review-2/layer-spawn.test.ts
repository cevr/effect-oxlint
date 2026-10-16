import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { ChildProcess } from "effect/process";

declare const TestLayer: Layer.Layer<never>;

// L1: @effect/vitest's documented it.layer block; every test inside names its timeout.
it.layer(TestLayer)("git", (it) => {
  it.effect(
    "status runs",
    () =>
      Effect.gen(function* () {
        yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
      }),
    30_000,
  );
});

// L2: the anonymous form, the inner test with options first.
it.layer(TestLayer)((it) => {
  it("spawns", { timeout: 30_000 }, () => {
    Bun.spawnSync(["true"]);
  });
});

// L4: the group given the layer's own timeout option too; every inner test names its own.
it.layer(TestLayer, { timeout: "30 seconds" })("git with a layer timeout", (it) => {
  it.effect(
    "status runs",
    () =>
      Effect.gen(function* () {
        yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
      }),
    { timeout: 30_000 },
  );
});

// L3: for contrast, a test straight on the imported it, naming its timeout.
it.effect(
  "status runs alone",
  () =>
    Effect.gen(function* () {
      yield* ChildProcess.make("git", ["status"], { forceKillAfter: "5 seconds" });
    }),
  30_000,
);
