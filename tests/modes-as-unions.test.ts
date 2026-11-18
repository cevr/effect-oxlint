import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const forms = ["interface", "alias", "parameter", "schema"] as const;
const modes = ["union", "single", "string"] as const;
const counts = [0, 1, 2, 3] as const;

interface RecordCase {
  readonly form: (typeof forms)[number];
  readonly props: boolean;
  readonly mode: (typeof modes)[number];
  readonly modeOptional: boolean;
  readonly optionals: (typeof counts)[number];
  readonly snake: boolean;
  readonly objectLiteral: boolean;
  readonly test: boolean;
}

const typeMembers = (c: RecordCase): ReadonlyArray<string> => {
  const modeType = { union: '"queued" | "running"', single: '"queued"', string: "string" }[c.mode];
  const optional = ["attempt?: number;", "error: string | undefined;", "owner: Owner | null;"];
  return [
    `status${when(c.modeOptional, "?")}: ${modeType};`,
    "id: string;",
    ...optional.slice(0, c.optionals),
    when(c.snake, "created_at: string;"),
    when(c.objectLiteral, 'object: "job";'),
  ];
};

const schemaMembers = (c: RecordCase): ReadonlyArray<string> => {
  const modeSchema = {
    union: 'Schema.Literals(["queued", "running"])',
    single: 'Schema.Literal("queued")',
    string: "Schema.String",
  }[c.mode];
  const wrapped = { true: `Schema.optional(${modeSchema})`, false: modeSchema }[
    `${c.modeOptional}`
  ];
  const optional = [
    "attempt: Schema.optional(Schema.Number),",
    "error: Schema.NullOr(Schema.String),",
    "owner: Schema.UndefinedOr(Owner),",
  ];
  return [
    `status: ${wrapped},`,
    "id: Schema.String,",
    ...optional.slice(0, c.optionals),
    when(c.snake, "created_at: Schema.String,"),
    when(c.objectLiteral, 'object: Schema.Literal("job"),'),
  ];
};

const recordSource = (c: RecordCase): string => {
  const name = `Job${when(c.props, "Props")}`;
  const members = { true: schemaMembers(c), false: typeMembers(c) }[`${c.form === "schema"}`]
    .filter((line) => line !== "")
    .map((line) => `  ${line}`)
    .join("\n");
  return {
    interface: `export interface ${name} {\n${members}\n}\n`,
    alias: `export type ${name} = {\n${members}\n};\n`,
    parameter: `export function run(job: {\n${members}\n}) {\n  return job;\n}\n`,
    schema: `import { Schema } from "effect";\nexport const ${name} = Schema.Struct({\n${members}\n});\n`,
  }[c.form];
};

/** The reference: a required literal-union mode, two or more optional siblings, none of the four filters. */
const recordReported = (c: RecordCase): boolean =>
  !c.test &&
  c.form !== "parameter" &&
  !(c.props && c.form !== "schema") &&
  c.mode === "union" &&
  !c.modeOptional &&
  c.optionals >= 2 &&
  !c.snake &&
  !c.objectLiteral;

describe("noModeFieldWithOptionals", () => {
  test("reports a generated record iff the reference does", () => {
    const seed = 1118;
    const pick = seededPick(seed);
    const cases: ReadonlyArray<RecordCase> = Array.from({ length: 200 }, () => ({
      form: pick(forms),
      props: pick([false, false, true]),
      mode: pick(["union", "union", "single", "string"] as const),
      modeOptional: pick([false, false, true]),
      optionals: pick(counts),
      snake: pick([false, false, false, true]),
      objectLiteral: pick([false, false, false, true]),
      test: pick([false, false, false, true]),
    }));
    const name = (c: RecordCase, index: number) => `probe-${index}${when(c.test, ".test")}.ts`;
    const findings = lintFixtures(
      "noModeFieldWithOptionals",
      Object.fromEntries(cases.map((c, index) => [name(c, index), recordSource(c)])),
    );
    const wrong = cases.flatMap((c, index) => {
      const got = (findings.get(name(c, index)) ?? []).length > 0;
      if (got === recordReported(c)) return [];
      return [{ seed, index, got, source: recordSource(c) }];
    });
    expect(wrong).toEqual([]);
  });
});

describe("noModeFieldWithOptionals outside the project", () => {
  test("leaves declaration files alone and reports the same record in a source file", () => {
    const record =
      'export interface Job {\n  status: "queued" | "running";\n  attempt?: number;\n  error?: string;\n}\n';
    const findings = lintFixtures("noModeFieldWithOptionals", {
      "src/job.ts": record,
      "types/vendor.d.ts": record,
      "types/vendor.d.mts": record,
    });
    expect(findings.get("src/job.ts")).toHaveLength(1);
    expect(findings.get("types/vendor.d.ts")).toEqual([]);
    expect(findings.get("types/vendor.d.mts")).toEqual([]);
  });

  test("leaves files matching an allow glob alone (a vendor API mirror)", () => {
    const record =
      'export interface Charge {\n  status: "pending" | "paid";\n  receipt?: string;\n  refund?: string;\n}\n';
    const findings = lintFixtures(
      "noModeFieldWithOptionals",
      { "src/billing/charge.ts": record, "src/clients/payments/charge.ts": record },
      { options: [{ allow: ["**/clients/**"] }] },
    );
    expect(findings.get("src/billing/charge.ts")).toHaveLength(1);
    expect(findings.get("src/clients/payments/charge.ts")).toEqual([]);
  });
});

describe("noBooleanStateCluster", () => {
  test("reports a component with three or more boolean states, once, outside tests", () => {
    const seed = 1118;
    const pick = seededPick(seed);
    const initials = ["false", "true", '""', "0", "undefined"] as const;
    const cases = Array.from({ length: 60 }, () => ({
      initials: Array.from({ length: pick([2, 3, 4]) }, () => pick(initials)),
      test: pick([false, false, false, true]),
    }));
    const source = (c: (typeof cases)[number]): string =>
      [
        'import { useState } from "react";',
        "export function Drawer() {",
        ...c.initials.map(
          (initial, index) => `  const [s${index}, setS${index}] = useState(${initial});`,
        ),
        "  return <div />;",
        "}",
        "",
      ].join("\n");
    const name = (c: (typeof cases)[number], index: number) =>
      `probe-${index}${when(c.test, ".test")}.tsx`;
    const findings = lintFixtures(
      "noBooleanStateCluster",
      Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)])),
    );
    const wrong = cases.flatMap((c, index) => {
      const booleans = c.initials.filter((i) => i === "true" || i === "false").length;
      const expected = Number(!c.test && booleans >= 3);
      const got = (findings.get(name(c, index)) ?? []).length;
      if (got === expected) return [];
      return [{ seed, index, got, source: source(c) }];
    });
    expect(wrong).toEqual([]);
  });
});
