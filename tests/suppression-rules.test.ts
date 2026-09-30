import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

const findings = lintFixtures("requireSuppressionReason", {
  "directives.ts": [
    "// oxlint-disable-next-line no-shadow -- fixture shadows an imported test API", // 1
    "export const named = 1;",
    "// oxlint-disable-next-line no-shadow", // 3: no reason
    "export const unexplained = 1;",
    "// eslint-disable-next-line -- no rule named", // 5: no target
    "export const blanket = 1;",
    "// @ts-expect-error", // 7: no reason
    "export const wrong: string = 1;",
    "// @ts-expect-error -- fixture checks a rejected assignment", // 9
    "export const explained: string = 1;",
    "/* @effect-diagnostics effect/asyncFunction:off -- host adapter */", // 11: prefixed
    "// @effect-diagnostics-next-line asyncFunction:off -- host adapter", // 12
    'export const quoted = "// oxlint-disable-next-line inside a string";', // 13
    "/**",
    " * Prose that mentions eslint-disable mid-line is not a directive.",
    " * @ts-ignore -- a JSDoc gutter directive with a reason",
    " */",
    "export const documented = 1;",
    "export const trailing = 1; // eslint-disable-line no-console", // 19: no reason
    "/* eslint-disable",
    "   no-console,",
    "   no-debugger -- a rule list that spans lines */", // 20-22
    "// @effect-diagnostics", // 23: no target, no reason
    "// @ts-nocheck", // 24: no reason
    "",
  ].join("\n"),
});

const messagesOn = (line: number) =>
  (findings.get("directives.ts") ?? [])
    .filter((finding) => finding.line === line)
    .map((finding) => finding.message);

describe("requireSuppressionReason", () => {
  test("reports suppressions without a reason", () => {
    for (const line of [3, 7, 19, 24]) {
      expect(messagesOn(line)).toEqual([expect.stringContaining("needs a reason after ` -- `")]);
    }
  });

  test("reports suppressions that do not name what they disable", () => {
    expect(messagesOn(5)).toEqual([expect.stringContaining("must name what it disables")]);
    expect(messagesOn(23)).toHaveLength(2);
    expect(messagesOn(23)[0]).toContain("ruleName:off");
  });

  test("reports effect/-prefixed Effect diagnostics rule names", () => {
    expect(messagesOn(11)).toEqual([expect.stringContaining("`asyncFunction:off`")]);
  });

  test("accepts named, explained directives and ignores directive text outside comments", () => {
    expect(
      [...new Set((findings.get("directives.ts") ?? []).map((finding) => finding.line))].sort(
        (left, right) => left - right,
      ),
    ).toEqual([3, 5, 7, 11, 19, 23, 24]);
  });
});

describe("noLintEvasion", () => {
  test("reports undefined, null, and unknown spelled through Effect APIs", () => {
    const results = lintCases("noLintEvasion", {
      valid: [
        "const value = Option.getOrUndefined(found);",
        "const value = Option.getOrElse(Option.none(), () => 0);",
        "type Decoded = Schema.Schema.Type<typeof Payload>;",
        "type Encoded = Schema.Codec.Encoded<typeof Schema.Unknown>;",
        "const unknownSchema = Schema.Unknown;",
        "const Option = { getOrUndefined: (x) => x, none: () => 0 }; Option.getOrUndefined(Option.none());",
      ],
      invalid: [
        "const missing = Option.getOrUndefined(Option.none());",
        "const missing = Option.getOrNull(Option.none());",
        'import { Option as O } from "effect"; const missing = O.getOrUndefined(O.none());',
        'import * as Opt from "effect/Option"; const missing = Opt.getOrUndefined(Opt.none());',
        "type Anything = Schema.Schema.Type<typeof Schema.Unknown>;",
        "type Anything = typeof Schema.Unknown.Type;",
        'import { Schema as S } from "effect"; const f = (input: S.Schema.Type<typeof S.Unknown>) => input;',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names the evaded rule", () => {
    const evasions = lintFixtures("noLintEvasion", {
      "evasion.ts": [
        "const missing = Option.getOrUndefined(Option.none());",
        "type Anything = Schema.Schema.Type<typeof Schema.Unknown>;",
      ].join("\n"),
    });
    expect(evasions.get("evasion.ts")).toEqual([
      { line: 1, message: expect.stringContaining("effect/noNullish") },
      { line: 2, message: expect.stringContaining("effect/noUnknownParameters") },
    ]);
  });
});
