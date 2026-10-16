// Counsel's B1 extension: Vitest 4.1 calls rooted at the imported `test` that are not tests.
import { test } from "vitest";
import { spawn } from "node:child_process";

// V1: test.describe with a body (a group); the inner test names its timeout.
test.describe("group", () => {
  test("spawns", () => {
    Bun.spawnSync(["true"]);
  }, 30_000);
});

// V2: test.suite, the same group under its other name.
test.suite("suite group", () => {
  test("spawns", { timeout: 30_000 }, () => {
    Bun.spawnSync(["true"]);
  });
});

// V3: test.extend's builder form: a fixture that starts a server process.
export const serverTest = test.extend("server", async ({}, { onCleanup }) => {
  const child = spawn("node", ["server.js"]);
  onCleanup(() => child.kill());
  return child;
});

// V4: test.override's builder form.
export const overridden = serverTest.override("server", async ({}, { onCleanup }) => {
  const child = spawn("node", ["other.js"]);
  onCleanup(() => child.kill());
  return child;
});

// V5: a hook on the test API that starts a process, given its own timeout.
test.beforeAll(() => {
  Bun.spawnSync(["true"]);
}, 30_000);

// V6: a hook on the test API that starts a process, with no timeout.
test.beforeEach(() => {
  Bun.spawnSync(["true"]);
});

// V7: for contrast, a test that names its timeout.
test("direct", () => {
  Bun.spawnSync(["true"]);
}, 30_000);
