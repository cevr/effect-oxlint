// Vitest 4.1 hands a suite's factory its test API (SuiteFactory = (test) => …).
import { describe, test } from "vitest";

// D1: test.describe whose inner test runs on the factory's parameter and names its timeout.
test.describe("group on test", (t) => {
  t("spawns", () => {
    Bun.spawnSync(["true"]);
  }, 30_000);
});

// D2: describe (not rooted at test) whose inner test runs on the parameter, with no timeout.
describe("group on describe", (t) => {
  t("spawns", () => {
    Bun.spawnSync(["true"]);
  });
});
