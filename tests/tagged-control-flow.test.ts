import type { ESTree } from "@oxlint/plugins";
import { describe, expect, test } from "bun:test";

import { preferCatchTag } from "../src/rules/prefer-catch-tag.js";
import { preferMatchTagsExhaustive } from "../src/rules/prefer-match-tags-exhaustive.js";
import { preferPredicateIsTagged } from "../src/rules/prefer-predicate-is-tagged.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

const tagEquals = (subject: string, tag: string) =>
  Testing.binaryExpr("===", Testing.memberExpr(subject, "_tag"), Testing.strLiteral(tag));

/** The two tagged-flow rules report only in files that import Effect. */
const effectImport = {
  type: "ImportDeclaration",
  source: Testing.strLiteral("effect"),
  specifiers: [],
};

const runInEffectFile = (
  rule: typeof preferPredicateIsTagged,
  visitor: string,
  node: Parameters<typeof Testing.runRule>[2],
): ReturnType<typeof Testing.runRule> =>
  Testing.runRuleMulti(rule, [
    ["ImportDeclaration", effectImport],
    [visitor, node],
  ]);

const inEffectFile = (source: string): string => `import { Match } from "effect";\n${source}`;

const or = (left: ESTree.Expression, right: ESTree.Expression) => ({
  type: "LogicalExpression",
  operator: "||",
  left,
  right,
});

const returningSwitch = (subject = "state") => ({
  type: "SwitchStatement",
  discriminant: Testing.memberExpr(subject, "_tag"),
  cases: [
    {
      type: "SwitchCase",
      test: Testing.strLiteral("Idle"),
      consequent: [Testing.returnStmt(Testing.strLiteral("idle"))],
    },
    {
      type: "SwitchCase",
      test: Testing.strLiteral("Running"),
      consequent: [Testing.returnStmt(Testing.strLiteral("running"))],
    },
  ],
});

/** `if (Idle) return; else if (Running) return;`, with an optional final `else` branch. */
const returningIfChain = (...fallback: [] | [ESTree.Statement]) =>
  Testing.ifStmt(
    tagEquals("state", "Idle"),
    Testing.returnStmt(Testing.strLiteral("idle")),
    Testing.ifStmt(
      tagEquals("state", "Running"),
      Testing.returnStmt(Testing.strLiteral("running")),
      ...fallback,
    ),
  );

describe("tagged value predicates", () => {
  test("nudges combined tag comparisons toward Predicate.isTagged", () => {
    const expression = or(tagEquals("event", "Created"), tagEquals("event", "Updated"));
    expect(runInEffectFile(preferPredicateIsTagged, "LogicalExpression", expression)).toHaveLength(
      1,
    );
  });

  test("allows a simple local tag guard and comparisons on different values", () => {
    expect(
      runInEffectFile(preferPredicateIsTagged, "BinaryExpression", tagEquals("event", "Created")),
    ).toHaveLength(0);
    expect(
      runInEffectFile(
        preferPredicateIsTagged,
        "LogicalExpression",
        or(tagEquals("left", "Created"), tagEquals("right", "Updated")),
      ),
    ).toHaveLength(0);
  });
});

describe("closed tagged union transformations", () => {
  test("nudges return-only tag switches toward Match.tagsExhaustive", () => {
    expect(
      runInEffectFile(preferMatchTagsExhaustive, "SwitchStatement", returningSwitch()),
    ).toHaveLength(1);
  });

  test("nudges terminal return-only tag if chains toward Match.tagsExhaustive", () => {
    expect(
      runInEffectFile(preferMatchTagsExhaustive, "IfStatement", returningIfChain()),
    ).toHaveLength(1);
  });

  test("nudges terminal sequences of return-only tag guards toward Match.tagsExhaustive", () => {
    const first = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.returnStmt(Testing.strLiteral("idle")),
    );
    const second = Testing.ifStmt(
      tagEquals("state", "Running"),
      Testing.returnStmt(Testing.strLiteral("running")),
    );
    const block = Testing.blockStmt([first, second]);
    Object.defineProperty(first, "parent", { value: block });
    Object.defineProperty(second, "parent", { value: block });

    expect(runInEffectFile(preferMatchTagsExhaustive, "IfStatement", first)).toHaveLength(1);
    expect(runInEffectFile(preferMatchTagsExhaustive, "IfStatement", second)).toHaveLength(0);
  });

  test("allows partial switches and stateful switches", () => {
    const results = lintCases("preferMatchTagsExhaustive", {
      valid: [
        inEffectFile(
          'const label = (state: State) => { switch (state._tag) { case "Idle": return "idle"; case "Running": return "running"; default: return "unknown"; } };',
        ),
        inEffectFile(
          'const record = (state: State) => { switch (state._tag) { case "Idle": break; case "Running": break; } };',
        ),
      ],
      invalid: [
        inEffectFile(
          'const label = (state: State) => { switch (state._tag) { case "Idle": return "idle"; case "Running": return "running"; } };',
        ),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("allows a local tag guard and tag if chains with a fallback or stateful branch", () => {
    const localGuard = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.returnStmt(Testing.strLiteral("idle")),
    );
    expect(runInEffectFile(preferMatchTagsExhaustive, "IfStatement", localGuard)).toHaveLength(0);

    expect(
      runInEffectFile(
        preferMatchTagsExhaustive,
        "IfStatement",
        returningIfChain(Testing.returnStmt(Testing.strLiteral("unknown"))),
      ),
    ).toHaveLength(0);

    const nonterminalChain = returningIfChain();
    const block = Testing.blockStmt([
      nonterminalChain,
      Testing.returnStmt(Testing.strLiteral("unknown")),
    ]);
    Object.defineProperty(nonterminalChain, "parent", { value: block });
    expect(
      runInEffectFile(preferMatchTagsExhaustive, "IfStatement", nonterminalChain),
    ).toHaveLength(0);

    const firstGuard = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.returnStmt(Testing.strLiteral("idle")),
    );
    const secondGuard = Testing.ifStmt(
      tagEquals("state", "Running"),
      Testing.returnStmt(Testing.strLiteral("running")),
    );
    const guardsWithFallback = Testing.blockStmt([
      firstGuard,
      secondGuard,
      Testing.returnStmt(Testing.strLiteral("unknown")),
    ]);
    Object.defineProperty(firstGuard, "parent", { value: guardsWithFallback });
    expect(runInEffectFile(preferMatchTagsExhaustive, "IfStatement", firstGuard)).toHaveLength(0);

    const stateful = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.blockStmt([Testing.exprStmt(Testing.callExpr("recordIdle"))]),
      Testing.ifStmt(
        tagEquals("state", "Running"),
        Testing.blockStmt([Testing.exprStmt(Testing.callExpr("recordRunning"))]),
      ),
    );
    expect(runInEffectFile(preferMatchTagsExhaustive, "IfStatement", stateful)).toHaveLength(0);
  });
});

describe("tagged flow outside Effect files", () => {
  test("leaves tag comparisons alone in a file that does not import Effect", () => {
    expect(
      lintCases("preferPredicateIsTagged", {
        valid: [
          'const isKnown = (event: Event) => event._tag === "Created" || event._tag === "Updated";',
        ],
        invalid: [],
      }),
    ).toEqual({ reportedValid: [], missedInvalid: [] });
    expect(
      lintCases("preferMatchTagsExhaustive", {
        valid: [
          'const label = (state: State) => { switch (state._tag) { case "Idle": return "idle"; case "Running": return "running"; } };',
        ],
        invalid: [],
      }),
    ).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("typed Effect failure recovery", () => {
  test("nudges manual catchIf tag checks toward catchTag", () => {
    const predicate = Testing.arrowFn(tagEquals("error", "NotFound"), [Testing.id("error")]);
    const call = Testing.callOfMember("Effect", "catchIf", [predicate, Testing.arrowFn()]);
    expect(Testing.runRule(preferCatchTag, "CallExpression", call)).toHaveLength(1);
  });

  test("allows a named catchIf predicate", () => {
    const call = Testing.callOfMember("Effect", "catchIf", [
      Testing.id("isRetryable"),
      Testing.arrowFn(),
    ]);
    expect(Testing.runRule(preferCatchTag, "CallExpression", call)).toHaveLength(0);
  });

  test("nudges catchAll tag switches and if chains toward tagged recovery", () => {
    const switchHandler = Testing.arrowFn(Testing.blockStmt([returningSwitch("error")]), [
      Testing.id("error"),
    ]);
    const ifHandler = Testing.arrowFn(
      Testing.blockStmt([
        Testing.ifStmt(
          tagEquals("error", "NotFound"),
          Testing.returnStmt(Testing.callExpr("recover")),
        ),
      ]),
      [Testing.id("error")],
    );

    expect(
      Testing.runRule(
        preferCatchTag,
        "CallExpression",
        Testing.callOfMember("Effect", "catchAll", [switchHandler]),
      ),
    ).toHaveLength(1);
    expect(
      Testing.runRule(
        preferCatchTag,
        "CallExpression",
        Testing.callOfMember("Effect", "catchAll", [Testing.id("effect"), ifHandler]),
      ),
    ).toHaveLength(1);
  });

  test("allows named catchAll handlers and tag dispatch on unrelated values", () => {
    const unrelatedHandler = Testing.arrowFn(Testing.blockStmt([returningSwitch("state")]), [
      Testing.id("error"),
    ]);
    expect(
      Testing.runRule(
        preferCatchTag,
        "CallExpression",
        Testing.callOfMember("Effect", "catchAll", [Testing.id("recoverFailure")]),
      ),
    ).toHaveLength(0);
    expect(
      Testing.runRule(
        preferCatchTag,
        "CallExpression",
        Testing.callOfMember("Effect", "catchAll", [unrelatedHandler]),
      ),
    ).toHaveLength(0);
  });
});

describe("tag comparisons in parsed source", () => {
  test("read either operand order and member-path subjects", () => {
    const results = lintCases("preferPredicateIsTagged", {
      valid: [
        inEffectFile(
          'const isKnown = (event: Event) => event.payload._tag === "Created" || other._tag === "Updated";',
        ),
      ],
      invalid: [
        inEffectFile(
          'const isKnown = (event: Event) => "Created" === event.payload._tag || event.payload._tag === "Updated";',
        ),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("require distinct tags and accept block-bodied returns", () => {
    const results = lintCases("preferMatchTagsExhaustive", {
      valid: [
        inEffectFile(
          'function label(state: State) { if (state._tag === "Idle") { return 1; } else if (state._tag === "Idle") { return 2; } }',
        ),
      ],
      invalid: [
        inEffectFile(
          'function label(state: State) { if (state._tag === "Idle") { return 1; } else if (state._tag === "Running") { return 2; } }',
        ),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("read a catchIf predicate that returns from a block", () => {
    const results = lintCases("preferCatchTag", {
      valid: [
        'Effect.catchIf(effect, (error) => { return error._tag === "NotFound"; log(error); }, recover);',
      ],
      invalid: [
        'Effect.catchIf(effect, (error) => { return error._tag === "NotFound"; }, recover);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("tagged union declarations", () => {
  test("report a union of two or more tagged type literals, whatever the tag's case", () => {
    const results = lintCases("preferSchemaTaggedUnion", {
      valid: [
        'type One = { readonly _tag: "Only"; readonly value: number } | undefined;',
        'type Single = { readonly _tag: "idle" };',
        'type Lone = { _tag: "tool-call"; id: string } | string | undefined;',
        'const state: { _tag: "idle" } = { _tag: "idle" };',
        'type Empty = { _tag: "" } | { _tag: "" };',
        "type Named = Ok | Err;",
        'type Loose = { _tag: string } | { _tag: "Err" };',
        'type Kinds = { kind: "Ok" } | { kind: "Err" };',
        "const Result = Schema.TaggedUnion({ Ok: { value: Schema.Number }, Err: { error: Schema.String } });",
      ],
      invalid: [
        'type Result = { readonly _tag: "Ok"; readonly value: number } | { readonly _tag: "Err"; readonly error: string };',
        'type Quoted = { "_tag": "Ok" } | { "_tag": "Err" } | undefined;',
        'const handle = (event: { _tag: "Opened" } | { _tag: "Closed"; code: number }) => event;',
        'type Wire = { _tag: "regular" } | { _tag: "interjection" };',
        'type Part = { readonly _tag: "tool-call"; id: string } | { readonly _tag: "text-delta"; text: string };',
        'type Overlay = { _tag: "none" } | { _tag: "picker"; index: number } | undefined;',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

// The AS5 conflict fixture (prefer-tagged-error-handling vs preferPredicateIsTagged): each
// tag test in a broad catch handler or a catchIf predicate, written with `_tag` or with
// Predicate.isTagged, gets one finding with one remedy, Effect.catchTag/catchTags.
// Mutants: Predicate.isTagged not read as a tag test (lines 15 and 38 go quiet); a ternary
// handler of Effect.catch not read (lines 8 and 15); preferPredicateIsTagged not skipping a
// broad catch handler (a second finding, another remedy, on line 9).
describe("tag tests in Effect recovery handlers", () => {
  const fixture =
    '// The shared fixture: a broad Effect.catch handler that narrows two tags with `||`.\nimport { Effect, Predicate } from "effect";\n\ndeclare const task: Effect.Effect<number, { readonly _tag: "NotFound" } | { readonly _tag: "Gone" } | { readonly _tag: "Denied" }>;\ndeclare const recover: Effect.Effect<number>;\n\nexport const program = task.pipe(\n  Effect.catch((error) =>\n    error._tag === "NotFound" || error._tag === "Gone" ? recover : Effect.fail(error),\n  ),\n);\n\n// The same narrowing written as preferPredicateIsTagged asks, inline.\nexport const inline = task.pipe(\n  Effect.catch((error) =>\n    Predicate.isTagged(error, "NotFound") || Predicate.isTagged(error, "Gone")\n      ? recover\n      : Effect.fail(error),\n  ),\n);\n\n// And as a named refinement composed from Predicate.isTagged.\nconst isMissing = Predicate.or(Predicate.isTagged("NotFound"), Predicate.isTagged("Gone"));\nexport const named = task.pipe(\n  Effect.catch((error) => (isMissing(error) ? recover : Effect.fail(error))),\n);\n\n// catchIf with the inline tags: preferPredicateIsTagged exempts a catchIf predicate.\nexport const catchIf = task.pipe(\n  Effect.catchIf(\n    (error) => error._tag === "NotFound" || error._tag === "Gone",\n    () => recover,\n  ),\n);\n\n// catchIf with Predicate.isTagged: anti-slop reports it.\nexport const catchIfTagged = task.pipe(\n  Effect.catchIf((error) => Predicate.isTagged(error, "NotFound"), () => recover),\n);\n';
  test("get preferCatchTag alone, once per handler", () => {
    const lines = (rule: string) =>
      (lintFixtures(rule, { "a.ts": fixture }).get("a.ts") ?? []).map((finding) => finding.line);
    expect(lines("preferCatchTag")).toEqual([8, 15, 30, 38]);
    expect(lines("preferPredicateIsTagged")).toEqual([]);
  });
});
