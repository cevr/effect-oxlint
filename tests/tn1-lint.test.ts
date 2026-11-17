import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { tn1Stub } from "./support/tn1-stub.js";

const stub = tn1Stub();

describe("tn1Lint", () => {
  // Mutant: the byte offsets the binary reports used as UTF-16 indices. The
  // first line's twelve two-byte letters put byte offset of NARRATE twelve
  // units past it, which is on line 3 when not converted.
  test("reports a finding at the UTF-16 position of the binary's byte offset", () => {
    const findings = lintFixtures(
      "tn1Lint",
      {
        "a.ts": ['export const name = "éééééééééééé";', "// NARRATE", "x;", "y;", ""].join("\n"),
      },
      { options: [{ binary: stub.binary, nets: { narration: stub.weights } }], threads: 1 },
    );
    expect(findings.get("a.ts")).toEqual([
      { line: 2, message: "narration: flagged by a local network (p=0.900, model stub)" },
    ]);
  });

  // Mutant: only the first configured network run. Two networks, two findings.
  test("runs each configured network on the file's text", () => {
    const findings = lintFixtures(
      "tn1Lint",
      { "b.ts": ["export const one = 1;", "// NARRATE", ""].join("\n") },
      {
        options: [{ binary: stub.binary, nets: { narration: stub.weights, steps: stub.weights } }],
        threads: 1,
      },
    );
    expect((findings.get("b.ts") ?? []).map((finding) => finding.message)).toEqual([
      "narration: flagged by a local network (p=0.900, model stub)",
      "steps: flagged by a local network (p=0.900, model stub)",
    ]);
  });

  // Mutant: a failed run or a missing package ignored, so a configured rule goes quiet.
  test("reports a failed run and a missing package once, at the file's start", () => {
    const failed = lintFixtures(
      "tn1Lint",
      { "c.ts": "export const one = 1;\n" },
      { options: [{ binary: stub.binary, nets: { narration: "missing.tn1" } }], threads: 1 },
    );
    expect(failed.get("c.ts")).toEqual([
      {
        line: 1,
        message: expect.stringContaining(
          "tn1-lint: network narration: tn1-lint: cannot read weights",
        ),
      },
    ]);
    const missing = lintFixtures(
      "tn1Lint",
      { "d.ts": "export const one = 1;\n" },
      { options: [{ nets: { narration: stub.weights } }], threads: 1 },
    );
    expect(missing.get("d.ts")).toEqual([
      { line: 1, message: expect.stringContaining("@cevr/tn1-lint is not installed") },
    ]);
  });
});
