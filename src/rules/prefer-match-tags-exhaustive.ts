/** Prefer exhaustive Match transformations for closed tagged unions. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  isInsideCatchAllHandler,
  tagComparison,
  taggedSwitchSubject,
} from "./_tagged-control-flow.js";

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

const isElseIf = (node: ESTree.IfStatement): boolean =>
  node.parent?.type === "IfStatement" && node.parent.alternate === node;

const isTerminalStatement = (node: ESTree.IfStatement): boolean => {
  if (node.parent?.type !== "BlockStatement") return true;
  return node.parent.body.at(-1) === node;
};

const isCompleteIfTransformationShape = (node: ESTree.IfStatement): boolean => {
  if (isElseIf(node) || !isTerminalStatement(node)) return false;

  let current = node;
  let subject: string | undefined;
  const tags = new Set<string>();
  let branchCount = 0;

  while (true) {
    const comparison = tagComparison(current.test);
    if (comparison === null || !statementReturns(current.consequent)) return false;
    if (subject !== undefined && comparison.subject !== subject) return false;
    if (tags.has(comparison.tag)) return false;

    subject = comparison.subject;
    tags.add(comparison.tag);
    branchCount += 1;

    if (current.alternate === null) break;
    if (current.alternate.type !== "IfStatement") return false;
    current = current.alternate;
  }

  return branchCount >= 2;
};

const isCompleteSequentialIfTransformationShape = (node: ESTree.IfStatement): boolean => {
  if (node.alternate !== null || node.parent?.type !== "BlockStatement") return false;
  const statements = node.parent.body;
  const index = statements.indexOf(node);
  if (index < 0) return false;

  const comparison = tagComparison(node.test);
  if (comparison === null || !statementReturns(node.consequent)) return false;

  const previous = statements[index - 1];
  if (previous?.type === "IfStatement" && previous.alternate === null) {
    const previousComparison = tagComparison(previous.test);
    if (
      previousComparison?.subject === comparison.subject &&
      statementReturns(previous.consequent)
    ) {
      return false;
    }
  }

  const tags = new Set([comparison.tag]);
  for (const statement of statements.slice(index + 1)) {
    if (statement.type !== "IfStatement" || statement.alternate !== null) return false;
    const next = tagComparison(statement.test);
    if (
      next === null ||
      next.subject !== comparison.subject ||
      tags.has(next.tag) ||
      !statementReturns(statement.consequent)
    ) {
      return false;
    }
    tags.add(next.tag);
  }

  return tags.size >= 2;
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
      IfStatement: (node: ESTree.IfStatement) => {
        if (
          (!isCompleteIfTransformationShape(node) &&
            !isCompleteSequentialIfTransformationShape(node)) ||
          isInsideCatchAllHandler(node)
        ) {
          return Effect.void;
        }
        return context.report(
          Diagnostic.make({
            node,
            message:
              "Use Match.type with Match.tagsExhaustive so a new tagged variant requires a new branch.",
          }),
        );
      },
    };
  },
});
