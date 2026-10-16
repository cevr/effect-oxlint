import { it } from "vitest";
import { ChildProcess } from "effect/process";

// V1: Vitest's options-first overload, the form Vitest 3 recommends: the timeout is named.
it("spawns with options first", { timeout: 30_000 }, () => {
  Bun.spawnSync(["true"]);
});

// V2: options last, for contrast.
it("spawns with options last", () => {
  Bun.spawnSync(["true"]);
}, { timeout: 30_000 });

// V3: a test that only builds a command and reads its arguments; nothing runs.
it("builds a command", () => {
  const command = ChildProcess.make("git", ["status"]);
  return command;
});
