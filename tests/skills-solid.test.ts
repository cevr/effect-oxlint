import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const imports = ["solid", "alias", "solidStore", "react", "none"] as const;
const effects = {
  /** Solid 2: compute, then an apply that only sets a signal. */
  apply2Setter: "createEffect(size, (n) => setCount(n));",
  /** Solid 2: the apply writes the DOM. */
  apply2Dom: "createEffect(size, (n) => { label.textContent = String(n); });",
  /** Solid 1: one function that only sets signals. */
  one1Setter: "createEffect(() => { if (size() > 0) setCount(size()); });",
  /** Solid 1: one function that logs too. */
  one1Mixed: "createEffect(() => { setCount(size()); log(size()); });",
  /** An async writer: a fetch, not a derivation. */
  asyncFetch: "createEffect(async () => { const rows = await load(); setCount(rows.length); });",
  /** A `.then` writer. */
  thenFetch: "createEffect(() => { load().then((rows) => setCount(rows.length)); });",
  none: "",
} as const;
type EffectForm = keyof typeof effects;
const effectKeys = Object.keys(effects).filter((key): key is EffectForm => key in effects);

interface Case {
  readonly imports: (typeof imports)[number];
  /** Boolean signals among four signals. */
  readonly booleans: number;
  readonly effect: EffectForm;
  readonly loadingFlag: boolean;
  /** The body sits in a `createDownloads` primitive instead of a component. */
  readonly primitive: boolean;
  readonly test: boolean;
}

const create = (c: Case): string =>
  ({
    solid: "createSignal",
    alias: "makeSignal",
    solidStore: "createSignal",
    react: "useState",
    none: "createSignal",
  })[c.imports];

const source = (c: Case): string => {
  const signals = Array.from({ length: 4 }, (_, index) => {
    const initial = { true: "false", false: String(index) }[`${index < c.booleans}`];
    return `  const [flag${index}, setFlag${index}] = ${create(c)}(${initial});`;
  });
  const importLine = {
    solid: 'import { createEffect, createSignal } from "solid-js";',
    alias: 'import { createEffect, createSignal as makeSignal } from "solid-js";',
    solidStore:
      'import { createEffect, createSignal } from "solid-js";\nimport { createStore } from "solid-js/store";',
    react: 'import { useEffect as createEffect, useState } from "react";',
    none: 'import { createEffect, createSignal } from "./signals";',
  }[c.imports];
  const flag = when(
    c.loadingFlag,
    "  const start = async () => {\n    setFlag3(true);\n    await load();\n    setFlag3(false);\n  };",
  );
  const body = [
    ...signals,
    `  const [count, setCount] = ${create(c)}(0);`,
    "  const size = () => 3;",
    `  ${effects[c.effect]}`,
    flag,
  ].join("\n");
  const owner = {
    true: `export function createDownloads() {\n${body}\n  return count;\n}`,
    false: `export const Downloads = () => {\n${body}\n  return <p>{count()}</p>;\n};`,
  }[`${c.primitive}`];
  return `${importLine}\ndeclare const label: HTMLElement;\n${owner}\n`;
};

const solid = (c: Case): boolean => !c.test && c.imports !== "react" && c.imports !== "none";

const reference = {
  noBooleanSignalCluster: (c: Case): number => Number(solid(c) && !c.primitive && c.booleans >= 3),
  noDerivedSignalEffect: (c: Case): number =>
    Number(solid(c) && !c.primitive && (c.effect === "apply2Setter" || c.effect === "one1Setter")),
  /** Components and primitives both; the loading flag and the fetch are separate findings. */
  noPromiseMirroredSignal: (c: Case): number =>
    Number(solid(c) && (c.effect === "asyncFetch" || c.effect === "thenFetch")) +
    Number(solid(c) && c.loadingFlag),
} as const;

const rules = [
  "noBooleanSignalCluster",
  "noDerivedSignalEffect",
  "noPromiseMirroredSignal",
] as const;

describe("skills-solid rules", () => {
  const seed = 1119;
  const pick = seededPick(seed);
  const cases: ReadonlyArray<Case> = Array.from({ length: 150 }, () => ({
    imports: pick([...imports, "solid", "solid"]),
    booleans: pick([0, 1, 2, 3, 4]),
    effect: pick(effectKeys),
    loadingFlag: pick([false, false, true]),
    primitive: pick([false, false, false, true]),
    test: pick([false, false, false, true]),
  }));
  const name = (c: Case, index: number) => `probe-${index}${when(c.test, ".test")}.tsx`;
  const files = Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)]));

  for (const rule of rules) {
    test(`${rule} reports a generated Solid owner iff the reference does`, () => {
      const findings = lintFixtures(rule, files);
      const wrong = cases.flatMap((c, index) => {
        const got = (findings.get(name(c, index)) ?? []).length;
        const want = reference[rule](c);
        if (got === want) return [];
        return [{ seed, index, got, want, source: source(c) }];
      });
      expect(wrong).toEqual([]);
    });
  }
});
