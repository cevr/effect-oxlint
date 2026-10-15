import { describe, expect, test } from "bun:test";

import { type LintConfig, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

/** Lint one source with `noHistoryComment`: the lines it reports, in source order. */
const lines = (source: string, config: LintConfig = {}): ReadonlyArray<number> =>
  reportedLines(lintFixtures("noHistoryComment", { "case.ts": source }, config), "case.ts");

/** A project's own history forms: a loop's pass numbers, batch ids and ledger ids. */
const project: LintConfig = {
  options: [
    {
      history: "the ledger and git log",
      patterns: [
        { what: "a pass number", pattern: "\\bpass(?:es)?[ -]\\d+\\b", flags: "i" },
        { what: "a batch id", pattern: "\\bp\\d+-[a-z][a-z0-9]*\\b" },
        { what: "a ledger id", pattern: "\\b(?:PA|UR2|R3(?:-[a-z]+)*)-\\d+\\b|\\bG\\d{1,2}\\b" },
      ],
    },
  ],
};

describe("noHistoryComment", () => {
  test("a commit hash and what the code used to do are history in any project", () => {
    const source = [
      "// The two calls that differed (ab75a2a1).",
      "export const calls = 3;",
      "// The gap a Monitor used to fall into.",
      "/**",
      " * Fixed in 3f9c2e7d0b.",
      " */",
      "export const gap = 4;",
    ].join("\n");
    expect(lines(source)).toEqual([1, 3, 5]);
  });

  test("today's reasons, colours, counts and words are not history", () => {
    const source = [
      "// A crossfade is used to hide the seam; a mark is the time a word lands.",
      "// Used to rank candidates before a person hears them.",
      "// A colour is #a1b2c3 or 0x1f2e3d4c; a count is 1234567; a word is effaced.",
      "// It gets used to the load; they were used to it.",
      "// The second pass of the mix reads the first pass's peaks, 3 passes in all.",
      "// An FNV-1a hash, SHA-256, UTF-16, an MP3, the F6 key, a still A-01.jpg.",
      "export const today = 5;",
    ].join("\n");
    expect(lines(source)).toEqual([]);
  });

  test("a project's own forms come from the patterns option", () => {
    const source = [
      "// Fails under load (four times in passes 5 and 6).",
      "// Measured in the p4-sfx2 trials.",
      "// The stage says the frame landed (PA-11).",
      "// Read at the first screen only (UR2-17, the budget).",
      "// The message a rebind leaves stale, R3-film-lab-server-8.",
      "// Every page fits a phone (G8, `fitsPhone`).",
      "// The probe from the pass-2 guardrails.",
      "export const ledger = 6;",
    ].join("\n");
    expect(lines(source)).toEqual([]);
    expect(lines(source, project)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("each tell is its own report, at the words that tell it", () => {
    const findings = lintFixtures(
      "noHistoryComment",
      { "case.ts": "export const x = 1; // passes 5 and pass 6 (ab75a2a1)" },
      project,
    );
    expect(findings.get("case.ts")).toEqual([
      {
        line: 1,
        message:
          "a pass number in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.",
      },
      {
        line: 1,
        message:
          "a pass number in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.",
      },
      {
        line: 1,
        message:
          "a commit hash in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.",
      },
    ]);
  });

  test("history lives in git log unless the option names another place", () => {
    const findings = lintFixtures("noHistoryComment", {
      "case.ts": "// used to be slow (ab75a2a1)",
    });
    expect(findings.get("case.ts")?.map((finding) => finding.message)).toEqual([
      "a commit hash in a comment tells history: say what the code does today and why; how it got here lives in git log.",
    ]);
  });

  test("a shebang is not a comment", () => {
    expect(lines("#!/usr/bin/env ab75a2a1\nexport const x = 1;")).toEqual([]);
  });
});
