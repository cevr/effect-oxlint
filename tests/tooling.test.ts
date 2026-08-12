import { describe, expect, test } from "bun:test";

const packageRoot = new URL("..", import.meta.url).pathname;

const runAddRule = (...args: ReadonlyArray<string>) =>
  Bun.spawnSync(["bun", "run", "scripts/add-rule.ts", ...args], {
    cwd: packageRoot,
    stderr: "pipe",
    stdout: "pipe",
  });

describe("rule authoring tools", () => {
  test("prints a compiling Effect-first rule template without changing files", () => {
    const result = runAddRule("no-example", "--dry-run");
    const output = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("export const noExample = Rule.define");
    expect(output).toContain("const context = yield* RuleContext");
    expect(output).toContain("Diagnostic.make");
    expect(output).toContain("Effect.void");
  });

  test("rejects unsupported modes and invalid rule names", () => {
    expect(runAddRule("no-example", "--context").exitCode).toBe(1);
    expect(runAddRule("NoExample", "--dry-run").exitCode).toBe(1);
  });
});
