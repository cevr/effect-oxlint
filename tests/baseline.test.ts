import { describe, expect, test } from "bun:test";

import { lintFixtures, lintRun } from "./support/lint-fixtures.js";

/** mulberry32: a seeded generator, so a failing case replays from its seed. */
const generator = (seed: number) => {
  let state = seed >>> 0;
  return (bound: number): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) % bound;
  };
};

/** A file with `count` prose comments, each a noComments finding. */
const withComments = (count: number): string =>
  Array.from(
    { length: count },
    (_, index) => `// note ${index}\nexport const value${index} = ${index};\n`,
  ).join("") + "export const end = 0;\n";

/** The generator's seed: a failing case names it; set it here to replay one. */
const seed = 20261118;

describe("baseline option", () => {
  // The property over the rule's domain: for a file with n findings and an
  // entry a, the report is empty when n = a, every finding when n > a, and one
  // stale finding naming n when n < a. Mutants: `<` for `<=` on the stale
  // side (n = a reports a stale finding); the path matched by a bare suffix
  // or substring (xf0.ts takes f0.ts's entry).
  test(`n findings against an entry of a (seed ${seed})`, () => {
    const random = generator(seed);
    const cases = Array.from({ length: 24 }, (_, index) => ({
      name: `pkg/src/f${index}.ts`,
      key: `f${index}.ts`,
      found: random(6),
      allowed: 1 + random(5),
    }));
    const decoy = { name: "pkg/src/xf0.ts", found: 2 };
    const fixtures = Object.fromEntries([
      ...cases.map((c) => [c.name, withComments(c.found)] as const),
      [decoy.name, withComments(decoy.found)] as const,
    ]);
    const baseline = Object.fromEntries(cases.map((c) => [c.key, c.allowed]));
    const findings = lintFixtures("noComments", fixtures, { options: [{ baseline }] });
    for (const c of cases) {
      const got = findings.get(c.name) ?? [];
      const where = `${c.name}: ${c.found} findings against ${c.allowed} (seed ${seed})`;
      if (c.found === c.allowed) expect(got, where).toEqual([]);
      if (c.found > c.allowed) expect(got.length, where).toBe(c.found);
      if (c.found < c.allowed) {
        expect(got.length, where).toBe(1);
        expect(got[0]?.message, where).toContain(
          `has ${c.found} of this rule's findings, not ${c.allowed}`,
        );
      }
    }
    expect(findings.get(decoy.name)?.length, "xf0.ts has no entry: f0.ts's is not its").toBe(
      decoy.found,
    );
  });

  // Mutants: the option not wired into noEffectInFeature,
  // noCauseRecoveryOutsideBoundary or noKindNamedFiles (each file at its
  // count is reported). The other side is the property above.
  test.each([
    {
      rule: "noEffectInFeature",
      file: "notes/notes.tsx",
      count: 2,
      source:
        'import { useEffect } from "react";\nexport function Notes() {\n  useEffect(() => load(), []);\n  useEffect(() => save(), []);\n  return <ul />;\n}\n',
    },
    {
      rule: "noCauseRecoveryOutsideBoundary",
      file: "notes/run.ts",
      count: 2,
      source:
        'import { Effect } from "effect";\nexport const run = Effect.sandbox(program);\nexport const again = Effect.catchCause(program, f);\n',
    },
    {
      rule: "noKindNamedFiles",
      file: "src/notes/utils.ts",
      count: 1,
      source: "export const a = 1;\n",
    },
  ])("$rule: a file at its baseline count is silent", ({ rule, file, count, source }) => {
    const findings = lintFixtures(
      rule,
      { [file]: source },
      { options: [{ baseline: { [file]: count } }] },
    );
    expect(findings.get(file)).toEqual([]);
  });

  // Mutant: the schema's minimum dropped (an entry of 0 accepted, so the
  // file's one finding is reported as more than its count).
  test("refuses an entry of zero: a file with no findings has no entry", () => {
    const run = lintRun(
      "noComments",
      { "a.ts": withComments(1) },
      { options: [{ baseline: { "a.ts": 0 } }] },
    );
    expect(run.exitCode).toBe(1);
    expect(run.findings.get("a.ts")).toEqual([]);
  });
});
