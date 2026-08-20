import { describe, expect, test } from "bun:test";

import { preferCatchTag } from "../src/rules/prefer-catch-tag.js";
import { preferMatchTagsExhaustive } from "../src/rules/prefer-match-tags-exhaustive.js";
import { preferPredicateIsTagged } from "../src/rules/prefer-predicate-is-tagged.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

const tagEquals = (subject: string, tag: string) =>
  Testing.binaryExpr("===", Testing.memberExpr(subject, "_tag"), Testing.strLiteral(tag));

const or = (left: unknown, right: unknown) =>
  ({ type: "LogicalExpression", operator: "||", left, right }) as never;

const returningSwitch = (withDefault = false) => ({
  type: "SwitchStatement",
  discriminant: Testing.memberExpr("state", "_tag"),
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
});
