import { describe, it } from "bun:test";

// S1: a test that spawns with no timeout (the rule's target).
it("spawns", () => {
  Bun.spawnSync(["true"]);
});

// S2: a skipped test that spawns with no timeout.
it.skip("skipped spawn", () => {
  Bun.spawnSync(["true"]);
});

// S3: a test that names its timeout.
it("spawns with a budget", () => {
  Bun.spawnSync(["true"]);
}, 20_000);

// S4: a describe callback's test through a helper of the same file.
const helper = () => Bun.spawnSync(["true"]);
describe("group", () => {
  it("spawns through a helper", () => {
    helper();
  });
});
