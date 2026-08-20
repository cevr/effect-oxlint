/** Prefer exhaustive Match transformations for closed tagged unions. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isInsideCatchAllHandler, taggedSwitchSubject } from "./_tagged-control-flow.js";

const statementReturns = (statement: ESTree.Statement): boolean => {
  if (statement.type === "ReturnStatement") return true;
  if (statement.type !== "BlockStatement") return false;
  const last = statement.body.at(-1);
  if (last === undefined) return false;
  return statementReturns(last);
};

const caseReturns = (switchCase: ESTree.SwitchCase): boolean => {
  const last = switchCase.consequent.at(-1);
  if (last === undefined) return false;
  return statementReturns(last);
};

const isCompleteTransformationShape = (node: ESTree.SwitchStatement): boolean => {
  if (node.cases.length < 2 || taggedSwitchSubject(node) === null) return false;
  for (const switchCase of node.cases) {
    if (switchCase.test === null || switchCase.test.type !== "Literal") return false;
    if (typeof switchCase.test.value !== "string" || !caseReturns(switchCase)) return false;
  }
  return true;
};

export const preferMatchTagsExhaustive = Rule.define({
  name: "prefer-match-tags-exhaustive",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use Match.tagsExhaustive for a complete tagged-union transformation.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      SwitchStatement: (node: ESTree.SwitchStatement) => {
        if (!isCompleteTransformationShape(node) || isInsideCatchAllHandler(node)) {
          return Effect.void;
        }
        return context.report(
          Diagnostic.make({
            node,
            message:
              "Use Match.type with Match.tagsExhaustive so a new tagged variant requires a new case.",
          }),
        );
      },
    };
  },
});
