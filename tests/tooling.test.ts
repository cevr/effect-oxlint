import { describe, expect, test } from "bun:test";

import { runCommand } from "./support/run-command.js";

const runAddRule = (...args: ReadonlyArray<string>) =>
  runCommand(["bun", "run", "scripts/add-rule.ts", ...args]);

describe("rule authoring tools", () => {
  test("prints a compiling Effect-first rule template without changing files", () => {
    const result = runAddRule("no-example", "--dry-run");
    const output = result.stdout;

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
