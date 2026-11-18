import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const placements = ["one", "split", "root"] as const;
const elements = ["component", "intrinsic"] as const;
const paddings = ["none", "outside", "inside"] as const;

interface Case {
  /** `one`: value and setter on one element; `split`: on two elements under a `<section>`; `root`: on two direct children of the returned root. */
  readonly placement: (typeof placements)[number];
  readonly element: (typeof elements)[number];
  /** 120 static lines, outside the shared `<section>` or inside it. */
  readonly padding: (typeof paddings)[number];
  readonly inHandler: boolean;
  readonly inHook: boolean;
  readonly test: boolean;
}

const pad = (on: boolean): string =>
  when(on, Array.from({ length: 120 }, (_, line) => `      <p>static ${line}</p>`).join("\n"));

const source = (c: Case): string => {
  const one = {
    component: "<SearchBox value={query} onChange={setQuery} />",
    intrinsic: "<input value={query} onChange={(event) => setQuery(event.target.value)} />",
  }[c.element];
  const pair = "<Chart data={query} />\n        <SearchBox onChange={setQuery} />";
  const targets = { one, split: pair, root: pair }[c.placement];
  const inside = pad(c.padding === "inside");
  const body = {
    one: `<section>\n        ${targets}\n${inside}\n      </section>`,
    split: `<section>\n        ${targets}\n${inside}\n      </section>`,
    root: `${targets}\n${inside}`,
  }[c.placement];
  return [
    'import { useEffect, useState } from "react";',
    "export function Page() {",
    '  const [query, setQuery] = useState("");',
    when(c.inHook, "  useEffect(() => log(query), [query]);"),
    when(c.inHandler, '  const reset = () => setQuery("");'),
    "  return (",
    "    <main>",
    `      ${body}`,
    "      <Table />",
    pad(c.padding === "outside"),
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
};

/** The reference at the default options (100 lines, half the component). */
const reported = (c: Case): boolean => {
  if (c.test || c.inHandler || c.inHook || c.placement === "root") return false;
  if (c.placement === "one" && c.element === "component") return true;
  if (c.placement === "one") return c.padding !== "none";
  return c.padding === "outside";
};

/** The reference with the limits lifted (`minComponentLines: 0`, `maxSharedSpanRatio: 1`). */
const reportedUnlimited = (c: Case): boolean =>
  !c.test && !c.inHandler && !c.inHook && c.placement !== "root";

describe("preferColocatedState", () => {
  const seed = 1118;
  const pick = seededPick(seed);
  const cases: ReadonlyArray<Case> = Array.from({ length: 120 }, () => ({
    placement: pick(placements),
    element: pick(elements),
    padding: pick(paddings),
    inHandler: pick([false, false, true]),
    inHook: pick([false, false, true]),
    test: pick([false, false, false, true]),
  }));
  const name = (c: Case, index: number) => `probe-${index}${when(c.test, ".test")}.tsx`;
  const files = Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)]));
  const mismatches = (
    findings: ReadonlyMap<string, ReadonlyArray<unknown>>,
    expected: (c: Case) => boolean,
  ) =>
    cases.flatMap((c, index) => {
      const got = (findings.get(name(c, index)) ?? []).length > 0;
      if (got === expected(c)) return [];
      return [{ seed, index, got, source: source(c) }];
    });

  test("reports a generated state pair iff the reference does, at the default options", () => {
    expect(mismatches(lintFixtures("preferColocatedState", files), reported)).toEqual([]);
  });

  test("reports every inner placement once the size limits are lifted", () => {
    const findings = lintFixtures("preferColocatedState", files, {
      options: [{ minComponentLines: 0, maxSharedSpanRatio: 1 }],
    });
    expect(mismatches(findings, reportedUnlimited)).toEqual([]);
  });
});
