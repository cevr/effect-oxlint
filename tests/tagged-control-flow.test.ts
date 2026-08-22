import { describe, expect, test } from "bun:test";

import { preferCatchTag } from "../src/rules/prefer-catch-tag.js";
import { preferMatchTagsExhaustive } from "../src/rules/prefer-match-tags-exhaustive.js";
import { preferPredicateIsTagged } from "../src/rules/prefer-predicate-is-tagged.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

const tagEquals = (subject: string, tag: string) =>
  Testing.binaryExpr("===", Testing.memberExpr(subject, "_tag"), Testing.strLiteral(tag));

const or = (left: unknown, right: unknown) =>
  ({ type: "LogicalExpression", operator: "||", left, right }) as never;

const returningSwitch = (withDefault = false, subject = "state") => ({
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
    ...(withDefault
      ? [
          {
            type: "SwitchCase",
            test: null,
            consequent: [Testing.returnStmt(Testing.strLiteral("unknown"))],
          },
        ]
      : []),
  ],
});

const returningIfChain = (withFallback = false) =>
  Testing.ifStmt(
    tagEquals("state", "Idle"),
    Testing.returnStmt(Testing.strLiteral("idle")),
    Testing.ifStmt(
      tagEquals("state", "Running"),
      Testing.returnStmt(Testing.strLiteral("running")),
      withFallback ? Testing.returnStmt(Testing.strLiteral("unknown")) : undefined,
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
      Testing.runRule(preferMatchTagsExhaustive, "SwitchStatement", returningSwitch() as never),
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
    expect(
      Testing.runRule(preferMatchTagsExhaustive, "SwitchStatement", returningSwitch(true) as never),
    ).toHaveLength(0);

    const stateful = {
      ...returningSwitch(),
      cases: [
        {
          type: "SwitchCase",
          test: Testing.strLiteral("Idle"),
          consequent: [{ type: "BreakStatement", label: null }],
        },
        {
          type: "SwitchCase",
          test: Testing.strLiteral("Running"),
          consequent: [{ type: "BreakStatement", label: null }],
        },
      ],
    } as never;
    expect(Testing.runRule(preferMatchTagsExhaustive, "SwitchStatement", stateful)).toHaveLength(0);
  });

  test("allows a local tag guard and tag if chains with a fallback or stateful branch", () => {
    const localGuard = Testing.ifStmt(
      tagEquals("state", "Idle"),
      Testing.returnStmt(Testing.strLiteral("idle")),
    );
    expect(Testing.runRule(preferMatchTagsExhaustive, "IfStatement", localGuard)).toHaveLength(0);

    expect(
      Testing.runRule(preferMatchTagsExhaustive, "IfStatement", returningIfChain(true)),
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
    const switchHandler = Testing.arrowFn(Testing.blockStmt([returningSwitch(false, "error")]), [
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
    const unrelatedHandler = Testing.arrowFn(Testing.blockStmt([returningSwitch(false, "state")]), [
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
