import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

describe("array method rules in parsed source", () => {
  test("noArrayFilterMap skips a const declared without an initializer", () => {
    const findings = lintFixtures("noArrayFilterMap", {
      "declared.ts": [
        "declare const items; items.filter(Boolean).map(String);",
        "const known = [1, 2]; known.filter(Boolean).map(String);",
      ].join("\n"),
    });
    expect(reportedLines(findings, "declared.ts")).toEqual([2]);
  });

  test("noReduceAccumulatorCopy stops at a nested function declaration", () => {
    const results = lintCases("noReduceAccumulatorCopy", {
      valid: [
        "items.reduce((acc, item) => { function copy() { return Object.assign({}, acc); } return copy(); }, {});",
      ],
      invalid: ["items.reduce((acc, item) => Object.assign({}, acc, item), {});"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("noDynamicImports boundaries", () => {
  test("accepts named lazy-loading boundaries", () => {
    const results = lintCases("noDynamicImports", {
      valid: [
        'const [first] = await import("./module.js");',
        'function loadModule() { return import("./module.js"); }',
        'const loadModule = () => import("./module.js");',
      ],
      invalid: [
        'const [,] = await import("./module.js");',
        'export default function () { return import("./module.js"); }',
        'Other.promise(() => import("./module.js"));',
        'module.require("./module.js");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports createRequire and calls through its alias", () => {
    const findings = lintFixtures("noDynamicImports", {
      "alias.ts": [
        'import { createRequire } from "node:module";',
        "const load = createRequire(import.meta.url);",
        'load("./module.js");',
      ].join("\n"),
    });
    expect(reportedLines(findings, "alias.ts")).toEqual([2, 3]);
  });
});

describe("platform capability rules", () => {
  test("noGlobals ignores a shadowed banned call", () => {
    const results = lintCases("noGlobals", {
      valid: ["const fetch = () => 1; fetch();"],
      invalid: ["fetch();"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noModuleMocks ignores local test-API lookalikes and reports mock functions", () => {
    const results = lintCases("noModuleMocks", {
      valid: ['const vi = { mock: () => 1 }; vi.mock("./module.js");'],
      invalid: ['vi.mock("./module.js");', "vi.fn();"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noNodeBuiltinImport follows partial crypto and process aliases", () => {
    const results = lintCases("noNodeBuiltinImport", {
      valid: [
        'import process from "node:process"; process.cwd();',
        'import crypto from "node:crypto"; crypto.createHash("sha256");',
      ],
      invalid: [
        'import { "randomUUID" as uuid } from "node:crypto";',
        'import * as nodeCrypto from "node:crypto"; nodeCrypto.webcrypto.getRandomValues(bytes);',
        'import crypto from "node:crypto"; crypto.subtle.digest("SHA-256", bytes);',
        'import process from "node:process"; process.env;',
        'import { subtle } from "node:crypto"; subtle.digest("SHA-256", bytes);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("syntax rules", () => {
  test("noChainedTypeAssertions allows a single assertion", () => {
    const results = lintCases("noChainedTypeAssertions", {
      valid: ["const text = value as string;"],
      invalid: ["const text = (value as unknown) as string;"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("requireSuppressionReason reads an empty reason and names a lint example", () => {
    const findings = lintFixtures("requireSuppressionReason", {
      "empty-reason.ts": "// oxlint-disable-next-line no-console --\nexport const value = 1;",
      "blanket.ts": "// oxlint-disable-next-line -- blanket\nexport const value = 1;",
    });
    expect(reportedLines(findings, "empty-reason.ts")).toEqual([1]);
    expect(findings.get("blanket.ts")).toEqual([
      { line: 1, message: expect.stringContaining("oxlint-disable-next-line rule-name -- reason") },
    ]);
  });
});
