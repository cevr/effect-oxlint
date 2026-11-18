import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const subjects = ["constant", "member", "literal", "computed", "local", "lookup", "found"] as const;
const matchers = ["toBe", "toBeDefined", "toBeTruthy", "toMatchSnapshot", "toBeInstanceOf"] as const;
const enclosings = ["plain", "local", "loop"] as const;

interface Case {
  readonly subject: (typeof subjects)[number];
  readonly matcher: (typeof matchers)[number];
  readonly empty: boolean;
  /** The block's second case repeats the first one's body; else it checks something else. */
  readonly duplicate: boolean;
  /** `plain`: `base` is a module constant; `local`: the describe callback binds it; `loop`: a `for…of` does. */
  readonly enclosing: (typeof enclosings)[number];
  readonly contract: boolean;
  /** A helper call that also asserts (`expectCanonical(…)`, `assert.equal(…)`), or "". */
  readonly helper: string;
  readonly test: boolean;
}

const subjectText = {
  constant: "LIMIT",
  member: "LIMIT_TABLE.max",
  literal: "250",
  computed: "wait(LIMIT)",
  local: "base",
  lookup: "ITEMS.find((item) => item.id === 1)",
  found: "found",
} as const;

const expectation = (c: Case): string => {
  const argument = {
    toBe: "250",
    toBeDefined: "",
    toBeTruthy: "",
    toMatchSnapshot: "",
    toBeInstanceOf: "TimedOut",
  }[c.matcher];
  const lookup = when(c.subject === "found", "const found = ITEMS.find((item) => item.id === 1);\n    ");
  const helper = when(c.helper !== "", `\n    ${c.helper}`);
  return `${lookup}expect(${subjectText[c.subject]}).${c.matcher}(${argument});${helper}`;
};

const source = (c: Case): string => {
  const body = when(!c.empty, `\n    ${expectation(c)}\n  `);
  const note = when(c.contract, "  // contract: pinned for parity with the billing system\n");
  const first = `${note}  it("first", () => {${body}});`;
  const second = {
    true: `${note}  it("second", () => {${body}});`,
    false: '  it("second", () => {\n    expect(wait(1)).toEqual({ _tag: "Done" });\n  });',
  }[`${c.duplicate}`];
  const suite = `describe("limit", () => {\n${when(c.enclosing === "local", "  const base = 2;\n")}${first}\n${second}\n});`;
  return [
    'import { describe, expect, it } from "bun:test";',
    "const LIMIT = 250;",
    when(c.enclosing === "plain", "const base = 1;"),
    {
      plain: suite,
      local: suite,
      loop: `for (const base of [1, 2]) {\n${suite}\n}`,
    }[c.enclosing],
    "",
  ].join("\n");
};

/** Findings each rule owes one copy of the first case's body. */
const perBody = {
  noConstantRestated: (c: Case) =>
    !c.empty &&
    !c.contract &&
    c.matcher === "toBe" &&
    (c.subject === "constant" || c.subject === "literal"),
  noEmptyTest: (c: Case) => c.empty,
  noExistenceOnlyAssert: (c: Case) =>
    !c.empty &&
    c.helper === "" &&
    c.subject !== "lookup" &&
    c.subject !== "found" &&
    (c.matcher === "toBeDefined" || c.matcher === "toBeTruthy"),
  noSnapshotWithoutContract: (c: Case) => !c.empty && !c.contract && c.matcher === "toMatchSnapshot",
} as const;

const rules = [
  "noConstantRestated",
  "noEmptyTest",
  "noExistenceOnlyAssert",
  "noSnapshotWithoutContract",
  "noRepeatedCase",
] as const;

/** The number of findings a rule owes a generated file. */
const expectedCount = (rule: (typeof rules)[number], c: Case): number => {
  if (!c.test) return 0;
  if (rule === "noRepeatedCase") {
    const readsBinding = !c.empty && c.subject === "local" && c.enclosing !== "plain";
    return Number(c.duplicate && !readsBinding);
  }
  const owed = Number(perBody[rule](c));
  return owed * (1 + Number(c.duplicate));
};

describe("skills-tests rules", () => {
  const seed = 1118;
  const pick = seededPick(seed);
  const cases: ReadonlyArray<Case> = Array.from({ length: 150 }, () => ({
    subject: pick([...subjects, "local", "local"]),
    matcher: pick(matchers),
    empty: pick([false, false, false, false, true]),
    duplicate: pick([true, false]),
    enclosing: pick(enclosings),
    contract: pick([false, false, false, true]),
    helper: pick(["", "", "", "", "expectCanonical(wait(1));", "assert.equal(wait(1), 1);"]),
    test: pick([true, true, true, false]),
  }));
  const name = (c: Case, index: number) => `probe-${index}${when(c.test, ".test")}.ts`;
  const files = Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)]));

  for (const rule of rules) {
    test(`${rule} reports a generated test file iff the reference does`, () => {
      const findings = lintFixtures(rule, files);
      const wrong = cases.flatMap((c, index) => {
        const got = (findings.get(name(c, index)) ?? []).length;
        const want = expectedCount(rule, c);
        if (got === want) return [];
        return [{ seed, index, got, want, source: source(c) }];
      });
      expect(wrong).toEqual([]);
    });
  }
});
