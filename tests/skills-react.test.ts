import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const kinds = [
  "derive",
  "reset",
  "syncUp",
  "syncUpNoArg",
  "mixed",
  "flagEvent",
  "flagRef",
  "thenSet",
] as const;
type Kind = (typeof kinds)[number];
type Deps = "none" | "empty" | "values";

interface Case {
  readonly kind: Kind;
  readonly deps: Deps;
  readonly wrapIf: boolean;
  readonly cleanup: boolean;
  readonly flagSetTrue: boolean;
  readonly pendingStart: boolean;
  readonly pendingEnd: boolean;
}

const bodies: Record<Kind, string> = {
  derive: 'setV(a + "!");',
  reset: 'setV("");',
  syncUp: "onChange(v);",
  syncUpNoArg: "onReady();",
  mixed: "setV(a); track(a);",
  flagEvent: "if (flag) { upload(a); }",
  flagRef: "if (flag) { ref.current?.focus(); }",
  thenSet: "load(a).then((r) => setV(r));",
};

const depsText: Record<Deps, string> = { none: "", empty: ", []", values: ", [a, v, flag]" };

const source = (c: Case): string => {
  const flagKind = c.kind === "flagEvent" || c.kind === "flagRef";
  const wrapped = when(c.wrapIf && !flagKind, `if (a) { ${bodies[c.kind]} }`);
  const body = wrapped || bodies[c.kind];
  const cleanup = when(c.cleanup, " return () => track(a);");
  return [
    'import { useEffect, useRef, useState } from "react";',
    "export function Probe({ a, onChange, onReady }: Props) {",
    '  const [v, setV] = useState("");',
    "  const [flag, setFlag] = useState(false);",
    "  const [busy, setBusy] = useState(false);",
    "  const ref = useRef<HTMLInputElement>(undefined);",
    `  useEffect(() => { ${body}${cleanup} }${depsText[c.deps]});`,
    `  const save = async () => { ${when(c.pendingStart, "setBusy(true);")} await store(a); ${when(c.pendingEnd, "setBusy(false);")} };`,
    `  return <input ref={ref} value={v} disabled={busy} onClick={() => setFlag(${when(c.flagSetTrue, "true") || "!flag"})} onBlur={save} />;`,
    "}",
    "",
  ].join("\n");
};

/** The reference: which rule must report a case, read from how it was built. */
const expected = (c: Case): ReadonlySet<string> => {
  const plain = c.deps !== "none" && c.deps !== "empty" && !c.cleanup;
  const fired = new Set<string>();
  if (plain && (c.kind === "derive" || c.kind === "reset")) fired.add("noDerivedStateEffect");
  if (plain && c.kind === "syncUp") fired.add("noEffectSyncUp");
  if (plain && c.kind === "flagEvent" && c.flagSetTrue) fired.add("noEffectEventLogic");
  if (c.pendingStart && c.pendingEnd) fired.add("noPromiseMirroredState");
  if (c.deps !== "none" && c.kind === "thenSet") fired.add("noPromiseMirroredState");
  return fired;
};

const generate = (seed: number, count: number): ReadonlyArray<Case> => {
  const pick = seededPick(seed);
  const flags = [true, false] as const;
  return Array.from({ length: count }, () => ({
    kind: pick(kinds),
    deps: pick<Deps>(["none", "empty", "values", "values"]),
    wrapIf: pick(flags),
    cleanup: pick([false, false, true]),
    flagSetTrue: pick(flags),
    pendingStart: pick(flags),
    pendingEnd: pick(flags),
  }));
};

const rules = [
  "noDerivedStateEffect",
  "noEffectSyncUp",
  "noEffectEventLogic",
  "noPromiseMirroredState",
] as const;

describe("skills-react effect rules", () => {
  test("each rule reports a generated component iff the reference says so", () => {
    const seed = 20261118;
    const cases = generate(seed, 64);
    const files = Object.fromEntries(cases.map((c, index) => [`probe-${index}.tsx`, source(c)]));
    for (const rule of rules) {
      expect(cases.filter((c) => expected(c).has(rule)).length).toBeGreaterThan(0);
      const findings = lintFixtures(rule, files);
      const wrong = cases.flatMap((c, index) => {
        const reported = (findings.get(`probe-${index}.tsx`) ?? []).length > 0;
        if (reported === expected(c).has(rule)) return [];
        return [{ seed, index, rule, reported, case: c, source: source(c) }];
      });
      expect(wrong).toEqual([]);
    }
  });

  test("noDerivedStateEffect tells a reset from a derived value", () => {
    const findings = lintFixtures("noDerivedStateEffect", {
      "reset.tsx": source({
        kind: "reset",
        deps: "values",
        wrapIf: false,
        cleanup: false,
        flagSetTrue: false,
        pendingStart: false,
        pendingEnd: false,
      }),
      "derive.tsx": source({
        kind: "derive",
        deps: "values",
        wrapIf: true,
        cleanup: false,
        flagSetTrue: false,
        pendingStart: false,
        pendingEnd: false,
      }),
    });
    expect(findings.get("reset.tsx")).toEqual([
      { line: 7, message: expect.stringContaining("give the component a `key`") },
    ]);
    expect(findings.get("derive.tsx")).toEqual([
      { line: 7, message: expect.stringContaining("Compute the value during render") },
    ]);
  });

  test("component rules skip test modules", () => {
    const probe = source({
      kind: "syncUp",
      deps: "values",
      wrapIf: false,
      cleanup: false,
      flagSetTrue: false,
      pendingStart: false,
      pendingEnd: false,
    });
    const findings = lintFixtures("noEffectSyncUp", {
      "probe.test.tsx": probe,
      "probe.tsx": probe,
    });
    expect(findings.get("probe.test.tsx")).toEqual([]);
    expect(findings.get("probe.tsx")).toHaveLength(1);
  });
});
