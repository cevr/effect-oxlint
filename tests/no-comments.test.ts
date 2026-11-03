import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";

const findings = lintFixtures("noComments", {
  "comments.ts": [
    "// oxlint-disable-next-line no-shadow -- fixture shadows an imported test API", // 1
    "export const named = 1;",
    "// Explains the next line.", // 3
    "export const explained = 1;",
    "/** Documents the export. */", // 5
    "export const documented = 1;",
    "// @ts-expect-error -- fixture checks a rejected assignment", // 7
    "export const wrong: string = 1;",
    '/// <reference types="bun" />', // 9
    "export const pure = /* #__PURE__ */ Symbol();", // 10
    "/** @jsxImportSource react */", // 11
    "/**", // 12
    " * Prose before a directive is still prose.",
    " * @ts-ignore -- a JSDoc gutter directive with a reason",
    " */",
    "export const trailing = 1; // a trailing note", // 16
    "// TODO: remove later", // 17
    "/* eslint-disable", // 18
    "   no-console -- a rule list that spans lines */",
    "// prettier-ignore", // 20
    "// @effect-diagnostics-next-line asyncFunction:off -- host adapter", // 21
    'export const quoted = "// a comment inside a string";', // 22
    "/* c8 ignore next */", // 23
    "",
  ].join("\n"),
});

const lines = () =>
  [...new Set((findings.get("comments.ts") ?? []).map((finding) => finding.line))].sort(
    (left, right) => left - right,
  );

describe("noComments", () => {
  test("reports every comment that is not a tool directive", () => {
    expect(lines()).toEqual([3, 5, 12, 16, 17]);
  });

  test("tells the reader where the comment's content belongs instead", () => {
    const [first] = findings.get("comments.ts") ?? [];
    expect(first?.message).toContain("Comments are not allowed");
  });

  test("accepts suppressions, type-check and Effect directives, references, annotations, pragmas and ignores", () => {
    for (const line of [1, 7, 9, 10, 11, 18, 20, 21, 22, 23]) {
      expect(lines()).not.toContain(line);
    }
  });
});
