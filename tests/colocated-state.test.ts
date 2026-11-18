import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const placements = ["one", "split", "root"] as const;
const elements = ["component", "intrinsic"] as const;
const files = ["module", "test", "fixture"] as const;

interface Case {
  /** `one`: value and setter on one element; `split`: on two elements under a `<section>`; `root`: on two direct children of the returned root. */
  readonly placement: (typeof placements)[number];
  readonly element: (typeof elements)[number];
  /** `map`: the targets sit in a list row, `items.map((item) => <li>…</li>)`; `slot`: in the callback of another call, `slots.render(() => <li>…</li>)`. */
  readonly row: "none" | "map" | "slot";
  readonly inHandler: boolean;
  readonly inHook: boolean;
  readonly file: (typeof files)[number];
}

const source = (c: Case): string => {
  const one = {
    component: "<SearchBox value={query} onChange={setQuery} />",
    intrinsic: "<input value={query} onChange={(event) => setQuery(event.target.value)} />",
  }[c.element];
  const pair = "<Chart data={query} />\n        <SearchBox onChange={setQuery} />";
  const plain = { one, split: pair, root: pair }[c.placement];
  const wrap = (call: string) =>
    `{${call}(\n        <li key="row">\n          ${plain}\n        </li>\n      ))}`;
  const targets = {
    none: plain,
    map: wrap("items.map((item) => "),
    slot: wrap("slots.render(() => "),
  }[c.row];
  const body = {
    one: `<section>\n        ${targets}\n      </section>`,
    split: `<section>\n        ${targets}\n      </section>`,
    root: targets,
  }[c.placement];
  return [
    'import { useEffect, useState } from "react";',
    "export function Page({ items, slots }: { items: string[]; slots: Slots }) {",
    '  const [query, setQuery] = useState("");',
    when(c.inHook, "  useEffect(() => log(query), [query]);"),
    when(c.inHandler, '  const reset = () => setQuery("");'),
    "  return (",
    "    <main>",
    `      ${body}`,
    "      <Table />",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
};

/** The reference: a pair passed to one child component alone, or used only inside a list row. */
const reported = (c: Case): boolean => {
  if (c.file !== "module" || c.inHandler || c.inHook) return false;
  return c.row === "map" || (c.placement === "one" && c.element === "component");
};

describe("preferColocatedState", () => {
  const seed = 1118;
  const pick = seededPick(seed);
  const cases: ReadonlyArray<Case> = Array.from({ length: 120 }, () => ({
    placement: pick(placements),
    element: pick(elements),
    row: pick(["none", "map", "slot"] as const),
    inHandler: pick([false, false, true]),
    inHook: pick([false, false, true]),
    file: pick(["module", "module", "module", "test", "fixture"]),
  }));
  const suffix = { module: "", test: ".test", fixture: ".fixture" } as const;
  const name = (c: Case, index: number) => `probe-${index}${suffix[c.file]}.tsx`;
  const sources = Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)]));

  test("reports a generated state pair iff the reference does", () => {
    const findings = lintFixtures("preferColocatedState", sources);
    const wrong = cases.flatMap((c, index) => {
      const got = (findings.get(name(c, index)) ?? []).length > 0;
      if (got === reported(c)) return [];
      return [{ seed, index, got, source: source(c) }];
    });
    expect(wrong).toEqual([]);
  });
});
