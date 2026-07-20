import { describe, expect, test } from "bun:test";

const packageRoot = new URL("..", import.meta.url).pathname;

const runFixture = (fixture: string) =>
  Bun.spawnSync(
    ["bunx", "oxlint", "--format", "unix", "--config", "tests/integration/oxlint.json", fixture],
    {
      cwd: packageRoot,
      env: process.env,
      stderr: "pipe",
      stdout: "pipe",
    },
  );

describe("compiled oxlint plugin", () => {
  test("accepts the constrained Effect-native boundary fixture", () => {
    const result = runFixture("tests/integration/valid.ts");
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).not.toContain("effect(");
  });

  test("reports every recommended rule through the real oxlint parser", () => {
    const result = runFixture("tests/integration/invalid.ts");
    const output = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(1);
    for (const rule of [
      "noAsyncFunction",
      "noDynamicImports",
      "noEffectBind",
      "noEffectDo",
      "noGlobals",
      "noNewError",
      "noNewPromise",
      "noNodeBuiltinImport",
      "noTernary",
      "noTestLifecycleHooks",
      "noThrowStatement",
      "noTryCatch",
    ]) {
      expect(output).toContain(`effect(${rule})`);
    }
  });
});
