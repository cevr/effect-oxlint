import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";

const lines = (
  findings: ReadonlyMap<string, ReadonlyArray<{ readonly line: number }>>,
  file: string,
) => (findings.get(file) ?? []).map((finding) => finding.line);

describe("noFlakeMasking", () => {
  // LANDMINES probe/cases/flake.test.ts lines 5 to 8, which effect-oxlint did
  // not report, and the Effect forms. Mutants: retry never reported; a
  // timeout option never reported; a numeric last argument never read (a
  // number that is not the last argument, as in the describe call below,
  // is no timeout); vi.setConfig unread;
  // it.flakyTest unread; the case call of test.each(table) unread.
  test("reports retries and raised timeouts on cases, vi.setConfig and it.flakyTest", () => {
    const findings = lintFixtures("noFlakeMasking", {
      "flake.test.ts": [
        'import { expect, it, test, vi } from "vitest";',
        'test("retry option", { retry: 3 }, async () => { expect(await work()).toBe(1); });',
        'test("timeout option", { timeout: 60_000 }, async () => { expect(await work()).toBe(1); });',
        'test("timeout argument", async () => { expect(await work()).toBe(1); }, 60_000);',
        "vi.setConfig({ testTimeout: 60_000 });",
        'it.effect("syncs the outbox", () => syncOutbox, { retry: 3, timeout: 60_000 });',
        'it.flakyTest(syncOutbox, "30 seconds");',
        'it.scoped("opens a pool", () => openPool, 30_000);',
        'describe("a suite", { retry: 2 }, () => {});',
        "describe(3, () => {});",
        'test.each([[1, 2, 3]])("adds %i", (a, b, c) => { expect(a + b).toBe(c); }, 500);',
        'test.each([{ retry: 1, timeout: 2 }])("case %o", (c) => { expect(c.retry).toBe(1); });',
        "const options = { retry: 3, timeout: 10 };",
        'it("retries the request in the code under test", () => { expect(Effect.retry(request, options)).toBeDefined(); });',
        'it.effect("times out", () => Effect.timeout(slow, "1 second"));',
        "",
      ].join("\n"),
    });
    expect(lines(findings, "flake.test.ts")).toEqual([2, 3, 4, 5, 6, 6, 7, 8, 9, 11]);
  });

  // Mutants: a config key read outside a `test:` block (build's retry is
  // reported); a runner config not linted.
  test("reports retry and raised timeouts in a runner config's test block only", () => {
    const findings = lintFixtures("noFlakeMasking", {
      "vitest.config.ts": [
        'import { defineConfig } from "vitest/config";',
        "export default defineConfig({",
        "  build: { retry: 1 },",
        "  test: { retry: 2, testTimeout: 30_000, hookTimeout: 30_000, include: [] },",
        "});",
        "",
      ].join("\n"),
      "src/client.ts":
        'export const client = makeClient({ test: { retry: 3 } });\ntest("x", { retry: 3 }, () => {});\n',
    });
    expect(lines(findings, "vitest.config.ts")).toEqual([4, 4, 4]);
    expect(lines(findings, "src/client.ts")).toEqual([]);
  });
});
