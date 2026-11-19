import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick } from "./support/seeded.js";

const importForms = ["namespace", "named", "elsewhere", "other"] as const;
const decideBodies = {
  pure: "[new Published({ at: now })]",
  argDate: "[new Published({ at: new Date(cmd.at).getTime() })]",
  dateNow: "[new Published({ at: Date.now() })]",
  newDate: "[new Published({ at: new Date().getTime() })]",
  random: "[new Published({ at: now, seed: Math.random() })]",
  uuid: "[new Published({ at: now, id: crypto.randomUUID() })]",
  clock: "[new Published({ at: Clock.currentTimeMillis })]",
  fetch: "[new Published({ at: now, body: fetch(cmd.url) })]",
} as const;
const evolveBodies = {
  total: '(s._tag === "Draft" ? { _tag: "Live" as const, at: e.at } : s)',
  event: "({ ...s, last: new Published({ at: e.at }) })",
  throw: '{ throw new Error("not a draft"); }',
  fail: 'Effect.fail(new Error("not a draft"))',
  die: 'Effect.die("not a draft")',
  yield: "Effect.gen(function* () { return yield* new NotDraft(); })",
  localRejection: "new NotDraft()",
  importedRejection: "new Gone()",
} as const;
const tags = {
  PostRetitled: false,
  OrderSettled: false,
  PasswordReset: false,
  PostUpdated: true,
  BalanceSet: true,
  StatusChanged: true,
  RowModified: true,
} as const;

const decideKeys = Object.keys(decideBodies).filter(
  (key): key is DecideBody => key in decideBodies,
);
const evolveKeys = Object.keys(evolveBodies).filter(
  (key): key is EvolveBody => key in evolveBodies,
);
const tagKeys = Object.keys(tags).filter((key): key is Tag => key in tags);

type DecideBody = keyof typeof decideBodies;
type EvolveBody = keyof typeof evolveBodies;
type Tag = keyof typeof tags;

interface Case {
  readonly imports: (typeof importForms)[number];
  readonly block: "Aggregate" | "View";
  readonly decide: DecideBody;
  /** The impure read sits in a helper outside the model: the transitive form is not reported. */
  readonly inHelper: boolean;
  readonly evolve: EvolveBody;
  readonly section: "evolve" | "reply";
  readonly tag: Tag;
}

const prefix = (c: Case, name: string): string =>
  ({ namespace: `Domain.${name}`, named: name, elsewhere: `Domain.${name}`, other: `Kit.${name}` })[
    c.imports
  ];

const importLine = (c: Case): string =>
  ({
    namespace: 'import * as Domain from "@alchemy.run/domain";',
    named: 'import { Aggregate, Event, Rejection, View } from "@alchemy.run/domain";',
    elsewhere: 'import * as Domain from "./domain-kit";',
    other: 'import * as Domain from "@alchemy.run/domain";\nimport * as Kit from "./domain-kit";',
  })[c.imports];

const source = (c: Case): string => {
  const impure = decideBodies[c.decide];
  const decideBody = { true: "stamp(now)", false: impure }[`${c.inHelper}`];
  const decide = `  decide: { Publish: (post, cmd, now) => ${decideBody} },\n`;
  const handler = { evolve: "(s, e) =>", reply: "(s, e) =>" }[c.section];
  return [
    'import * as Effect from "effect/Effect";',
    'import * as Clock from "effect/Clock";',
    importLine(c),
    'import { Gone } from "./Gone.rejection";',
    `class NotDraft extends ${prefix(c, "Rejection")}("NotDraft") {}`,
    `class Published extends ${prefix(c, "Event")}("${c.tag}", { at: Number }) {}`,
    `const stamp = (now: number) => ${impure};`,
    `export class Post extends ${prefix(c, c.block)}("Post", {`,
    decide,
    `  ${c.section}: { Published: ${handler} ${evolveBodies[c.evolve]} },`,
    "}) {}",
    "",
  ].join("\n");
};

const domain = (c: Case): boolean => c.imports === "namespace" || c.imports === "named";

const reference = {
  pureDecide: (c: Case): number =>
    Number(
      domain(c) &&
        c.block === "Aggregate" &&
        !c.inHelper &&
        c.decide !== "pure" &&
        c.decide !== "argDate",
    ),
  /** The yield form fails twice: the `yield*` and the rejection it yields. */
  totalEvolve: (c: Case): number => {
    if (!domain(c)) return 0;
    return {
      total: 0,
      event: 0,
      throw: 1,
      fail: 1,
      die: 1,
      yield: 2,
      localRejection: 1,
      importedRejection: 1,
    }[c.evolve];
  },
  eventNameIsAFact: (c: Case): number => Number(domain(c) && tags[c.tag]),
} as const;

const rules = ["pureDecide", "totalEvolve", "eventNameIsAFact"] as const;

describe("skills-domain rules", () => {
  const seed = 1119;
  const pick = seededPick(seed);
  const cases: ReadonlyArray<Case> = Array.from({ length: 150 }, () => ({
    imports: pick(importForms),
    block: pick(["Aggregate", "Aggregate", "View"] as const),
    decide: pick(decideKeys),
    inHelper: pick([false, false, true]),
    evolve: pick(evolveKeys),
    section: pick(["evolve", "evolve", "reply"] as const),
    tag: pick(tagKeys),
  }));
  const name = (index: number) => `model-${index}.ts`;
  const files = Object.fromEntries(cases.map((c, index) => [name(index), source(c)]));

  for (const rule of rules) {
    test(`${rule} reports a generated model iff the reference does`, () => {
      const findings = lintFixtures(rule, files);
      const wrong = cases.flatMap((c, index) => {
        const got = (findings.get(name(index)) ?? []).length;
        const want = reference[rule](c);
        if (got === want) return [];
        return [{ seed, index, got, want, source: source(c) }];
      });
      expect(wrong).toEqual([]);
    });
  }

  test("a model in the upstream example's shape, with invented names, is clean", () => {
    const model = [
      'import * as Effect from "effect/Effect";',
      'import * as Domain from "@alchemy.run/domain";',
      'import { NotOpen } from "./NotOpen.rejection";',
      'class TrayOpened extends Domain.Event("TrayOpened", { owner: Owner }) {}',
      'class SeedsPlanted extends Domain.Event("SeedsPlanted", { count: Count, countAfter: Count }) {}',
      'class TrayFull extends Domain.Rejection("TrayFull", { room: Count }) {}',
      'const openFor = (s: TrayState) => (s._tag === "Open" ? s : new NotOpen());',
      'export class Tray extends Domain.Aggregate("Tray", {',
      "  id: TrayId,",
      "  state: TrayState,",
      '  initial: { _tag: "Empty" },',
      "  commands: [OpenTray, PlantSeeds],",
      "  decide: {",
      "    OpenTray: (tray, cmd) =>",
      '      tray._tag !== "Empty" ? new NotOpen() : [new TrayOpened({ owner: cmd.owner })],',
      "    PlantSeeds: Effect.fn(function* (tray, cmd, now) {",
      "      const o = openFor(tray);",
      '      if (o._tag !== "Open") return yield* o;',
      "      if (cmd.count > o.room) return yield* new TrayFull({ room: o.room });",
      "      return [new SeedsPlanted({ count: cmd.count, countAfter: o.count + cmd.count, at: now })];",
      "    }),",
      "  },",
      "  evolve: {",
      '    TrayOpened: (_, e) => ({ _tag: "Open" as const, owner: e.owner, count: 0 }),',
      '    SeedsPlanted: (s, e) => (s._tag === "Open" ? { ...s, count: e.countAfter } : s),',
      "  },",
      '  reply: { PlantSeeds: (s) => ({ count: s._tag === "Open" ? s.count : 0 }) },',
      "}) {}",
      "",
    ].join("\n");
    for (const rule of rules) {
      expect(lintFixtures(rule, { "tray.ts": model }).get("tray.ts")).toEqual([]);
    }
  });
});
