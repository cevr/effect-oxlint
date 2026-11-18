import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const bases = [
  "",
  "Error",
  "TypeError",
  'Data.TaggedError("Probe")<{}>',
  "Data.Error<{}>",
  'Schema.TaggedError<Probe>()("Probe", {})',
  'Context.Tag("Probe")<Probe, {}>()',
  "Base",
] as const;
const suffixes = ["Error", "Failure", "Defect", "Service", "Span"] as const;

interface ClassCase {
  readonly base: (typeof bases)[number];
  readonly tag: boolean;
  readonly suffix: (typeof suffixes)[number];
  readonly message: boolean;
}

const classSource = (c: ClassCase): string =>
  [
    'import { Context, Data, Schema } from "effect";',
    `export class Probe${c.suffix} ${when(c.base !== "", `extends ${c.base} `)}{`,
    when(c.tag, '  readonly _tag = "Probe";'),
    when(c.message, '  readonly message = "probe";'),
    "}",
    "",
  ].join("\n");

/** The reference: whether the rule must report the class, from how it was built. */
const reported = (c: ClassCase, allowData: boolean): boolean => {
  if (c.base === "Error" || c.base === "TypeError") return true;
  if (c.base.startsWith("Data.")) return !allowData;
  if (c.base.startsWith("Schema.") || c.base.startsWith("Context.") || !c.tag) return false;
  return c.suffix === "Error" || c.suffix === "Failure" || c.suffix === "Defect" || c.message;
};

describe("requireSchemaTaggedError", () => {
  test("reports a generated class iff the reference does, with and without allowDataTaggedError", () => {
    const seed = 1118;
    const pick = seededPick(seed);
    const flags = [true, false] as const;
    const cases: ReadonlyArray<ClassCase> = Array.from({ length: 60 }, () => ({
      base: pick(bases),
      tag: pick(flags),
      suffix: pick(suffixes),
      message: pick(flags),
    }));
    const files = Object.fromEntries(
      cases.map((c, index) => [`probe-${index}.ts`, classSource(c)]),
    );
    for (const allowData of flags) {
      const findings = lintFixtures("requireSchemaTaggedError", files, {
        options: [{ allowDataTaggedError: allowData }],
      });
      const wrong = cases.flatMap((c, index) => {
        const got = (findings.get(`probe-${index}.ts`) ?? []).length > 0;
        if (got === reported(c, allowData)) return [];
        return [{ seed, index, allowData, got, source: classSource(c) }];
      });
      expect(wrong).toEqual([]);
    }
  });

  test("leaves files without an Effect import and test modules alone", () => {
    const source = "export class ProbeError extends Error {}\n";
    const findings = lintFixtures("requireSchemaTaggedError", {
      "plain.ts": source,
      "effect.test.ts": `import { Effect } from "effect";\n${source}`,
    });
    expect(findings.get("plain.ts")).toEqual([]);
    expect(findings.get("effect.test.ts")).toEqual([]);
  });
});

describe("noSchemaClass", () => {
  test("bans Schema.Class and Schema.TaggedClass, keeps Schema.TaggedError and Struct", () => {
    const results = lintCases("noSchemaClass", {
      valid: [
        'import { Schema } from "effect";\nexport class Missing extends Schema.TaggedError<Missing>()("Missing", {}) {}',
        'import { Schema } from "effect";\nexport const Note = Schema.Struct({ id: Schema.String });\nexport interface Note extends Schema.Schema.Type<typeof Note> {}',
      ],
      invalid: [
        'import { Schema } from "effect";\nexport class Note extends Schema.Class<Note>("Note")({ id: Schema.String }) {}',
        'import { Schema } from "effect";\nexport class Ping extends Schema.TaggedClass<Ping>()("Ping", {}) {}',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("noInlineProvide chained form", () => {
  test("reports the second of two adjacent Effect.provide steps outside test modules", () => {
    const chained =
      'import { Effect } from "effect";\nexport const main = program.pipe(Effect.provide(NotesLive), Effect.provide(ClockLive));\n';
    const findings = lintFixtures("noInlineProvide", {
      "main.ts": chained,
      "main.test.ts": chained,
      "merged.ts":
        'import { Effect, Layer } from "effect";\nexport const main = program.pipe(Effect.provide(Layer.mergeAll(NotesLive, ClockLive)), Effect.map(f));\n',
    });
    expect(findings.get("main.ts")).toEqual([
      { line: 2, message: expect.stringContaining("provide it once") },
    ]);
    expect(findings.get("main.test.ts")).toEqual([]);
    expect(findings.get("merged.ts")).toEqual([]);
  });
});
