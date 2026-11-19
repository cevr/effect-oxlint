import { describe, expect, test } from "bun:test";

import * as building from "./perf/no-invariant-build-per-call.js";
import * as linear from "./perf/no-linear-search-in-loop.js";
import * as repeated from "./perf/no-repeated-pass.js";
import * as sorting from "./perf/no-sort-for-extreme.js";
import { lintFixtures, type LintConfig } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const flags = [true, false] as const;

/** Lint generated cases, one file each, and list the ones whose finding differs from the reference. */
const mismatches = <C>(
  rule: string,
  seed: number,
  cases: ReadonlyArray<C>,
  source: (c: C) => string,
  testModule: (c: C) => boolean,
  reported: (c: C) => boolean,
  config: LintConfig = {},
) => {
  const name = (c: C, index: number) => `probe-${index}${when(testModule(c), ".test")}.ts`;
  const findings = lintFixtures(
    rule,
    Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)])),
    config,
  );
  return cases.flatMap((c, index) => {
    const got = (findings.get(name(c, index)) ?? []).length > 0;
    if (got === reported(c)) return [];
    return [{ seed, index, got, source: source(c) }];
  });
};

describe("noLinearSearchInLoop", () => {
  const loops = ["for-of", "map", "forEach"] as const;
  const collections = ["orders", '["a", "b"]'] as const;
  const methods = ["find", "some", "filter", "findIndex", "includes", "indexOf", "map"] as const;
  const valueMethods: ReadonlyArray<string> = ["includes", "indexOf"];
  const searchedForms = ["users", "orders", "built", "text", "table", "literal"] as const;
  interface Case {
    readonly loop: (typeof loops)[number];
    readonly collection: (typeof collections)[number];
    readonly method: (typeof methods)[number];
    readonly searched: (typeof searchedForms)[number];
    readonly keyed: boolean;
    readonly test: boolean;
  }
  const source = (c: Case): string => {
    const build = when(c.searched === "built", "const users = load(order);");
    const searched = {
      users: "users",
      orders: "orders",
      built: "users",
      text: "text",
      table: "ROLES",
      literal: `["admin", "owner"]`,
    }[c.searched];
    const key = { true: "order.userId", false: '"root"' }[`${c.keyed}`];
    const argument = { true: key, false: `(user) => user.id === ${key}` }[
      `${valueMethods.includes(c.method)}`
    ];
    const search = `${searched}.${c.method}(${argument})`;
    const loop = {
      "for-of": `const out = [];\n  for (const order of ${c.collection}) {\n    ${build}\n    out.push(${search});\n  }\n  return out;`,
      map: `return ${c.collection}.map((order) => {\n    ${build}\n    return ${search};\n  });`,
      forEach: `${c.collection}.forEach((order) => {\n    ${build}\n    sink(${search});\n  });`,
    }[c.loop];
    return `const ROLES = ["admin", "owner"];\nexport function join(orders: Order[], users: User[], text: string) {\n  ${loop}\n}\n`;
  };
  /** The reference: a keyed search over another, outer-built collection in a loop over data (not a literal or UPPER_CASE table); a value search (`includes`) only on a known array, not the string `text`. */
  const reported = (c: Case): boolean =>
    !c.test &&
    c.keyed &&
    c.collection === "orders" &&
    ["find", "some", "filter", "findIndex", "includes", "indexOf"].includes(c.method) &&
    (c.searched === "users" || (c.searched === "text" && !valueMethods.includes(c.method)));

  test("reports a generated search iff the reference does", () => {
    const seed = 1118;
    const pick = seededPick(seed);
    const cases: ReadonlyArray<Case> = Array.from({ length: 160 }, () => ({
      loop: pick(loops),
      collection: pick(collections),
      method: pick(methods),
      searched: pick(searchedForms),
      keyed: pick(flags),
      test: pick([false, false, true]),
    }));
    expect(
      mismatches("noLinearSearchInLoop", seed, cases, source, (c) => c.test, reported),
    ).toEqual([]);
  });

  test("counted cost: the search grows by 4 when n doubles, the index by 2", () => {
    const [bad, bad2, good, good2] = [
      linear.searchInLoop(200),
      linear.searchInLoop(400),
      linear.indexOnce(200),
      linear.indexOnce(400),
    ];
    expect(good.names).toEqual(bad.names);
    expect(good2.names).toEqual(bad2.names);
    expect(bad2.calls).toBeGreaterThan(3.9 * bad.calls);
    expect({ good: good.calls, good2: good2.calls }).toEqual({ good: 400, good2: 800 });
  });
});

describe("noSortForExtreme", () => {
  const receivers = ["xs", "[...xs]"] as const;
  const sorts = ["sort", "toSorted", "filter"] as const;
  const accesses = ["[0]", "[1]", ".at(0)", ".at(-1)", ".at(1)"] as const;
  interface Case {
    readonly receiver: (typeof receivers)[number];
    readonly sort: (typeof sorts)[number];
    readonly access: (typeof accesses)[number];
    readonly test: boolean;
  }
  const source = (c: Case): string =>
    `export const pick = (xs: number[]) => ${c.receiver}.${c.sort}((a, b) => a - b)${c.access};\n`;
  const reported = (c: Case): boolean =>
    !c.test && c.sort !== "filter" && [".at(0)", ".at(-1)", "[0]"].includes(c.access);

  test("reports a generated sort-then-take iff the reference does", () => {
    const seed = 1118;
    const pick = seededPick(seed);
    const cases: ReadonlyArray<Case> = Array.from({ length: 60 }, () => ({
      receiver: pick(receivers),
      sort: pick(sorts),
      access: pick(accesses),
      test: pick([false, false, false, true]),
    }));
    expect(mismatches("noSortForExtreme", seed, cases, source, (c) => c.test, reported)).toEqual(
      [],
    );
  });

  test("counted cost: the sort grows faster than n, one pass by exactly n - 1", () => {
    const [bad, bad2, good, good2] = [
      sorting.sortForLeast(500),
      sorting.sortForLeast(1000),
      sorting.passForLeast(500),
      sorting.passForLeast(1000),
    ];
    expect([good.least, good2.least]).toEqual([bad.least, bad2.least]);
    expect(bad2.comparisons).toBeGreaterThan(2 * bad.comparisons);
    expect({ good: good.comparisons, good2: good2.comparisons }).toEqual({ good: 499, good2: 999 });
  });
});

describe("noRepeatedPass", () => {
  const methods = ["filter", "some", "every", "find", "findIndex", "map"] as const;
  const middles = ["", "if (flag) return a;", "xs.push(1);"] as const;
  const placements = ["straight", "branch", "logical"] as const;
  interface Case {
    readonly first: (typeof methods)[number];
    readonly second: (typeof methods)[number];
    readonly sameArray: boolean;
    readonly middle: (typeof middles)[number];
    readonly placement: (typeof placements)[number];
    readonly readsFirst: boolean;
    readonly test: boolean;
  }
  const source = (c: Case): string => {
    const array = { true: "xs", false: "ys" }[`${c.sameArray}`];
    const bound = { true: "a", false: "0" }[`${c.readsFirst}`];
    const second = `${array}.${c.second}((x) => x > ${bound})`;
    const statement = {
      straight: `const b = ${second};`,
      branch: `if (flag) {\n    const b = ${second};\n    sink(b);\n  }`,
      logical: `const b = flag && ${second};`,
    }[c.placement];
    return `export function f(xs: number[], ys: number[], flag: boolean) {\n  const a = xs.${c.first}((x) => x > 0);\n  ${c.middle}\n  ${statement}\n  return b;\n}\n`;
  };
  const passes = ["filter", "some", "every", "find", "findIndex"];
  /** The reference: two passes over one unchanged array on one straight path, the second independent. */
  const reported = (c: Case): boolean =>
    !c.test &&
    passes.includes(c.first) &&
    passes.includes(c.second) &&
    c.sameArray &&
    c.middle === "" &&
    c.placement === "straight" &&
    !c.readsFirst;

  test("reports a generated second pass iff the reference does", () => {
    const seed = 1118;
    const pick = seededPick(seed);
    const cases: ReadonlyArray<Case> = Array.from({ length: 60 }, () => ({
      first: pick(methods),
      second: pick(methods),
      sameArray: pick([true, true, false]),
      middle: pick(middles),
      placement: pick(placements),
      readsFirst: pick([false, false, true]),
      test: pick([false, false, false, true]),
    }));
    expect(mismatches("noRepeatedPass", seed, cases, source, (c) => c.test, reported)).toEqual([]);
  });

  test("counted cost: three passes make 3n callback calls, one loop n", () => {
    for (const n of [300, 600]) {
      const [bad, good] = [repeated.threePasses(n), repeated.onePass(n)];
      expect(good.sizes).toEqual(bad.sizes);
      expect({ bad: bad.calls, good: good.calls }).toEqual({ bad: 3 * n, good: n });
    }
  });
});

describe("noInvariantBuildPerCall", () => {
  const builds = [
    "new Intl.NumberFormat(ARGS)",
    "Intl.DateTimeFormat(ARGS)",
    "new globalThis.Intl.PluralRules(ARGS)",
    "value.toLocaleString(ARGS)",
    "new TextEncoder(ARGS)",
    "Schema.decodeUnknownSync(ARGS)",
    "Layer.succeed(ARGS)",
    "class extends Schema.Class<unknown>(ARGS)({}) {}",
    "Shop.build(ARGS)",
    "new Map(ARGS)",
    "new Date(ARGS)",
    "new Fmt.NumberFormat(ARGS)",
    "class extends Shape {}",
  ] as const;
  const argForms = [
    "",
    '"en-US"',
    "LOCALE, { currency: CURRENCY }",
    "locale",
    '"en-US", { currency }',
    "locale()",
  ] as const;
  const places = ["module", "function", "arrow", "nested"] as const;
  const configs = ["default", "own", "replace"] as const;
  interface Case {
    readonly build: (typeof builds)[number];
    readonly args: (typeof argForms)[number];
    readonly place: (typeof places)[number];
    readonly test: boolean;
  }
  const source = (c: Case): string => {
    const built = c.build.replace("ARGS", c.args);
    const body = {
      module: `export const built = [${built}];\nexport function show(locale: string, value: number) { const currency = "EUR"; return [locale, value, currency]; }`,
      function: `export function show(locale: string, value: number) {\n  const currency = "EUR";\n  return [${built}, currency];\n}`,
      arrow: `export const show = (locale: string, value: number) => {\n  const currency = "EUR";\n  return [${built}, currency];\n};`,
      nested: `export function outer(locale: string) {\n  const currency = "EUR";\n  return (value: number) => [${built}, currency, locale];\n}`,
    }[c.place];
    return `import { Layer, Schema } from "effect";\nconst LOCALE = "en-US";\nconst CURRENCY = "USD";\nconst value = 1;\ndeclare const Fmt: { NumberFormat: new (...a: unknown[]) => unknown };\ndeclare const Shop: { build: (...a: unknown[]) => unknown };\nclass Shape {}\n${body}\n`;
  };
  const defaults: ReadonlyArray<string> = builds.slice(0, 8);
  /** The reference: a table builder (the defaults unless replaced, plus the project's `Shop.build`), inside a function, from arguments that read no parameter, local or call; `toLocaleString` needs a locale and options. */
  const reported = (config: (typeof configs)[number]) => (c: Case): boolean => {
    const inTable =
      (config !== "replace" && defaults.includes(c.build)) ||
      (config !== "default" && c.build === "Shop.build(ARGS)");
    const constant = !["locale", '"en-US", { currency }', "locale()"].includes(c.args);
    const enoughArgs = c.build !== "value.toLocaleString(ARGS)" || c.args.includes(",");
    return !c.test && c.place !== "module" && inTable && constant && enoughArgs;
  };
  const options = {
    default: [],
    own: [{ builders: ["Shop.build"] }],
    replace: [{ builders: ["Shop.build"], replaceDefaults: true }],
  } as const;

  test("reports a generated build iff the reference does, under each table", () => {
    const seed = 1119;
    const pick = seededPick(seed);
    const found = configs.flatMap((config) => {
      const cases: ReadonlyArray<Case> = Array.from({ length: 60 }, () => ({
        build: pick(builds),
        args: pick(argForms),
        place: pick(places),
        test: pick([false, false, false, true]),
      }));
      return mismatches(
        "noInvariantBuildPerCall",
        seed,
        cases,
        source,
        (c) => c.test,
        reported(config),
        { options: options[config] },
      ).map((m) => ({ config, ...m }));
    });
    expect(found).toEqual([]);
  });

  test("counted cost: a builder per call builds n, the remedy one", () => {
    for (const n of [200, 400]) {
      const [bad, good] = [building.perCall(n), building.once(n)];
      expect(good.text).toEqual(bad.text);
      expect({ bad: bad.built, good: good.built }).toEqual({ bad: n, good: 1 });
    }
  });
});
