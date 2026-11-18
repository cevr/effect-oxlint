import { describe, expect, test } from "bun:test";

import { lintFixtures, lintRun } from "./support/lint-fixtures.js";
import { tn1Stub } from "./support/tn1-stub.js";

const stub = tn1Stub();

describe("tn1Lint", () => {
  // LM-RATCHET. Mutant: the baseline option not wired into tn1Lint (two
  // findings against an entry of two are reported).
  test("a file at its baseline count is silent", () => {
    const findings = lintFixtures(
      "tn1Lint",
      { "k.ts": ["export const one = 1;", "// NARRATE", ""].join("\n") },
      {
        options: [
          {
            binary: stub.binary,
            nets: { narration: stub.weights, steps: stub.weights },
            baseline: { "k.ts": 2 },
          },
        ],
        threads: 1,
      },
    );
    expect(findings.get("k.ts")).toEqual([]);
  });

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

  // Mutant: the package's lintSync not used (every file spawns the bin): the stub
  // package has no bin, so a spawn reports that it could not run. Mutant: a
  // lintSync that throws ignored, so the rule goes quiet on a failed network.
  test("runs the networks through the package's lintSync when it exports one", () => {
    const sidecar = {
      "node_modules/@cevr/tn1-lint/package.json": '{ "name": "@cevr/tn1-lint", "main": "lint.js" }',
      "node_modules/@cevr/tn1-lint/lint.js": [
        "exports.lintSync = ({ rule, weights, path, text }) => {",
        '  if (weights.endsWith("missing.tn1")) throw new Error(`tn1-lint: cannot read ${weights}`);',
        '  if (weights.endsWith("nomem.tn1")) throw new Error("tn1-lint: cannot start tn1-lint: spawn ENOMEM");',
        '  const at = text.indexOf("NARRATE");',
        "  if (at < 0) return [];",
        "  const span = { offset: Buffer.byteLength(text.slice(0, at)), length: 7 };",
        '  return [{ message: `${rule}: by lintSync`, code: `ergo-tn1(${rule})`, severity: "advice", filename: path, labels: [{ span }] }];',
        "};",
      ].join("\n"),
    };
    const found = lintFixtures(
      "tn1Lint",
      { ...sidecar, "e.ts": ['export const name = "éé";', "// NARRATE", ""].join("\n") },
      { options: [{ nets: { narration: stub.weights } }], threads: 1 },
    );
    expect(found.get("e.ts")).toEqual([{ line: 2, message: "narration: by lintSync" }]);
    const failed = lintFixtures(
      "tn1Lint",
      { ...sidecar, "f.ts": "export const one = 1;\n" },
      { options: [{ nets: { narration: "missing.tn1" } }], threads: 1 },
    );
    expect(failed.get("f.ts")).toEqual([
      {
        line: 1,
        message: expect.stringContaining("tn1-lint: network narration: tn1-lint: cannot read"),
      },
    ]);
    // Mutant: the sidecar's ENOMEM reported without what to do about it
    // (oxlint at many threads cannot fork; fewer threads can).
    const nomem = lintFixtures(
      "tn1Lint",
      { ...sidecar, "g.ts": "export const one = 1;\n" },
      { options: [{ nets: { narration: "nomem.tn1" } }], threads: 1 },
    );
    expect(nomem.get("g.ts")).toEqual([
      {
        line: 1,
        message: expect.stringContaining("spawn ENOMEM (the host could not copy oxlint's memory"),
      },
    ]);
  });

  // BL2's threads-16 run: a sidecar that cannot start (spawn ENOMEM) was a
  // warning on each of 11,371 files and oxlint exited 0, so a CI step passed
  // with nothing linted. Mutant: the down sidecar reported on every file.
  // Mutant: the run's exit code left alone (a warning exits 0).
  test("a sidecar that cannot start fails the run once, at warning severity too", () => {
    const down = {
      "node_modules/@cevr/tn1-lint/package.json": '{ "name": "@cevr/tn1-lint", "main": "lint.js" }',
      "node_modules/@cevr/tn1-lint/lint.js": [
        "exports.lintSync = () => {",
        '  const error = new Error("tn1-lint: cannot start tn1-lint: spawn ENOMEM");',
        '  error.code = "TN1_SIDECAR_DOWN";',
        "  throw error;",
        "};",
      ].join("\n"),
    };
    const files = {
      "h.ts": "export const one = 1;\n",
      "i.ts": "export const two = 2;\n",
      "j.ts": "export const three = 3;\n",
    };
    const run = lintRun(
      "tn1Lint",
      { ...down, ...files },
      { options: [{ nets: { narration: stub.weights } }], threads: 1, severity: "warn" },
    );
    // Every linted file counts, the stub package's lint.js too (it is linted first).
    const reported = [...run.findings.values()].flat();
    expect(reported).toEqual([
      {
        line: 1,
        message: expect.stringContaining(
          "tn1-lint: the sidecar cannot start, so this run lints no file",
        ),
      },
    ]);
    expect(run.exitCode).not.toBe(0);
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
