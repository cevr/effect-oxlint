import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

describe("tagged value construction", () => {
  test("reports raw tagged values at their construction sites", () => {
    const findings = lintFixtures("preferTaggedConstructors", {
      "producer.ts": [
        'const bootstrap = { _tag: "bootstrap" };',
        'const sample = { _tag: "success" as const, latencyMs: completedAt - startedAt };',
        'const failed = { _tag: "failure", latencyMs: 0 } satisfies PullSample;',
        'const changes = puts.map((put) => ({ _tag: "put", address: put.address }));',
        'journal.insert({ entry: { _tag: "change", documentId } });',
        'Effect.succeed({ _tag: "tool-call", id });',
        'const makeReady = (revision: number) => ({ _tag: "ready", revision });',
        'State.make({ _tag: "Ready", revision: 42 });',
      ].join("\n"),
    });
    expect(reportedLines(findings, "producer.ts")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(findings.get("producer.ts")?.[0]?.message).toStartWith("Prefer a schema constructor");
    expect(findings.get("producer.ts")?.[0]?.message).toContain("Data.taggedEnum");
    expect(findings.get("producer.ts")?.[0]?.message).toContain("Schema.TaggedUnion");
    expect(findings.get("producer.ts")?.[0]?.message).toContain(".cases.Tag.make");
  });

  test("recognizes static tag spellings and const aliases without treating schema fields as values", () => {
    expect(
      lintCases("preferTaggedConstructors", {
        valid: [
          'const schema = Schema.Struct({ _tag: Schema.Literal("ready"), revision: Schema.Number });',
          'const schema = Schema.TaggedStruct("ready", { revision: Schema.Number });',
          "const schema = Schema.TaggedUnion({ ready: { revision: Schema.Number }, bootstrap: {} });",
          'type Ready = { readonly _tag: "ready"; readonly revision: number };',
          'const { _tag = "ready" } = state;',
          'const value = { [key]: "ready" };',
          "const value = { _tag: dynamicTag };",
          "const value = { _tag: `ready-${id}` };",
          "const value = { _tag: 1 };",
          'const value = { get _tag() { return "ready"; } };',
          'const value = { _tag() { return "ready"; } };',
          "const value = { ...state, revision: 42 };",
          'const _tag = "ready"; function build(_tag: Schema.Schema) { return { _tag }; }',
          'const tag = "ready"; function build(tag: string) { return { _tag: tag }; }',
        ],
        invalid: [
          'const value = { "_tag": "ready" };',
          'const value = { ["_tag"]: "ready" };',
          "const value = { [`_tag`]: `ready` };",
          'const value = { _tag: ("ready" satisfies string) };',
          'const value = { _tag: <const>"ready" };',
          'const value = { _tag: "ready"! };',
          'const value = { ...fields, _tag: "ready" };',
          'const value = { _tag: "ready", ...fields };',
          'const tag = "ready"; const value = { _tag: tag };',
          'const first = "ready"; const second = first; const value = { _tag: second };',
          'const _tag = "ready" as const; const value = { _tag };',
          'const value = { _tag: "" };',
        ],
      }),
    ).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("allows constructors to supply the tag, including in test fixtures", () => {
    expect(
      lintCases("preferTaggedConstructors", {
        extension: "test.ts",
        valid: [
          'import { Data } from "effect"; const State = Data.taggedEnum<State>(); const value = State.Ready({ revision: 42 });',
          'import * as D from "effect/Data"; const { Ready } = D.taggedEnum<State>(); const value = Ready({ revision: 42 });',
          'import { Schema } from "effect"; const State = Schema.TaggedUnion({ Ready: { revision: Schema.Number }, Bootstrap: {} }); const value = State.cases.Ready.make({ revision: 42 });',
          'import * as S from "effect/Schema"; const State = S.TaggedUnion({ ready: { revision: S.Number }, "tool-call": { id: S.String } }); const value = State.cases["tool-call"].make({ id: "call-1" });',
          'const Ready = Schema.TaggedStruct("ready", { revision: Schema.Number }); const value = Ready.make({ revision: 42 });',
          "const value = new NotFound({ id });",
          "const value = createReady({ revision: 42 });",
          '// oxlint-disable-next-line effect/preferTaggedConstructors -- malformed wire fixture exercises the decoder\nconst value = { _tag: "ready", revision: "invalid" };',
        ],
        invalid: ['const fixture = { _tag: "ready", revision: 42 };'],
      }),
    ).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});
