import type { ESTree } from "@oxlint/plugins";
import { describe, expect, test } from "bun:test";

import { preferCatchTag } from "../src/rules/prefer-catch-tag.js";
import { preferMatchTagsExhaustive } from "../src/rules/prefer-match-tags-exhaustive.js";
import { preferPredicateIsTagged } from "../src/rules/prefer-predicate-is-tagged.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases } from "./support/lint-fixtures.js";

const tagEquals = (subject: string, tag: string) =>
  Testing.binaryExpr("===", Testing.memberExpr(subject, "_tag"), Testing.strLiteral(tag));

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
    expect(Testing.runRule(preferPredicateIsTagged, "LogicalExpression", expression)).toHaveLength(
      1,
    );
  });

  test("allows a simple local tag guard and comparisons on different values", () => {
    expect(
      Testing.runRule(preferPredicateIsTagged, "BinaryExpression", tagEquals("event", "Created")),
    ).toHaveLength(0);
    expect(
      Testing.runRule(
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
      Testing.runRule(preferMatchTagsExhaustive, "SwitchStatement", returningSwitch()),
    ).toHaveLength(1);
  });

  test("nudges terminal return-only tag if chains toward Match.tagsExhaustive", () => {
    expect(
      Testing.runRule(preferMatchTagsExhaustive, "IfStatement", returningIfChain()),
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

    expect(Testing.runRule(preferMatchTagsExhaustive, "IfStatement", first)).toHaveLength(1);
    expect(Testing.runRule(preferMatchTagsExhaustive, "IfStatement", second)).toHaveLength(0);
  });

  test("allows partial switches and stateful switches", () => {
    const results = lintCases("preferMatchTagsExhaustive", {
      valid: [
        'const label = (state: State) => { switch (state._tag) { case "Idle": return "idle"; case "Running": return "running"; default: return "unknown"; } };',
        'const record = (state: State) => { switch (state._tag) { case "Idle": break; case "Running": break; } };',
      ],
      invalid: [
        'const label = (state: State) => { switch (state._tag) { case "Idle": return "idle"; case "Running": return "running"; } };',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("allows a local tag guard and tag if chains with a fallback or stateful branch", () => {
    const localGuard = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.returnStmt(Testing.strLiteral("idle")),
    );
    expect(Testing.runRule(preferMatchTagsExhaustive, "IfStatement", localGuard)).toHaveLength(0);

    expect(
      Testing.runRule(
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
      Testing.runRule(preferMatchTagsExhaustive, "IfStatement", nonterminalChain),
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
    expect(Testing.runRule(preferMatchTagsExhaustive, "IfStatement", firstGuard)).toHaveLength(0);

    const stateful = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.blockStmt([Testing.exprStmt(Testing.callExpr("recordIdle"))]),
      Testing.ifStmt(
        tagEquals("state", "Running"),
        Testing.blockStmt([Testing.exprStmt(Testing.callExpr("recordRunning"))]),
      ),
    );
    expect(Testing.runRule(preferMatchTagsExhaustive, "IfStatement", stateful)).toHaveLength(0);
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
        'const isKnown = (event: Event) => event.payload._tag === "Created" || other._tag === "Updated";',
      ],
      invalid: [
        'const isKnown = (event: Event) => "Created" === event.payload._tag || event.payload._tag === "Updated";',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("require distinct tags and accept block-bodied returns", () => {
    const results = lintCases("preferMatchTagsExhaustive", {
      valid: [
        'function label(state: State) { if (state._tag === "Idle") { return 1; } else if (state._tag === "Idle") { return 2; } }',
      ],
      invalid: [
        'function label(state: State) { if (state._tag === "Idle") { return 1; } else if (state._tag === "Running") { return 2; } }',
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
