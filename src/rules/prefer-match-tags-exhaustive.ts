/** Prefer exhaustive Match transformations for closed tagged unions. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  hasOneTaggedSubject,
  isInsideCatchAllHandler,
  tagComparison,
  taggedSwitchSubject,
  type TagComparison,
} from "./_tagged-control-flow.js";

const statementReturns = (statement: ESTree.Statement): boolean => {
  if (statement.type === "ReturnStatement") return true;
  if (statement.type !== "BlockStatement") return false;
  return Option.exists(Arr.last(statement.body), statementReturns);
};

const caseReturns = (switchCase: ESTree.SwitchCase): boolean =>
  Option.exists(Arr.last(switchCase.consequent), statementReturns);

const isCompleteSwitchTransformation = (node: ESTree.SwitchStatement): boolean => {
  if (node.cases.length < 2 || Option.isNone(taggedSwitchSubject(node))) return false;
  for (const switchCase of node.cases) {
    if (switchCase.test?.type !== "Literal") return false;
    if (!Predicate.isString(switchCase.test.value) || !caseReturns(switchCase)) return false;
  }
  return true;
};

const isElseIf = (node: ESTree.IfStatement): boolean =>
  node.parent?.type === "IfStatement" && node.parent.alternate === node;

const isTerminalStatement = (node: ESTree.IfStatement): boolean => {
  if (node.parent?.type !== "BlockStatement") return true;
  return node.parent.body.at(-1) === node;
};

const isPlainIf = (statement: ESTree.Statement): statement is ESTree.IfStatement =>
  statement.type === "IfStatement" && Predicate.isNull(statement.alternate);

/** The tag a branch compares, when the branch always returns. */
const returningTagComparison = (branch: ESTree.IfStatement): Option.Option<TagComparison> =>
  Option.filter(tagComparison(branch.test), () => statementReturns(branch.consequent));

/** Whether at least two returning branches each compare one subject against a distinct tag. */
const isDistinctTagDispatch = (branches: ReadonlyArray<ESTree.IfStatement>): boolean =>
  Option.exists(
    Option.all(branches.map(returningTagComparison)),
    (comparisons) =>
      hasOneTaggedSubject(comparisons) &&
      new Set(comparisons.map((comparison) => comparison.tag)).size === comparisons.length,
  );

/** The if statement and each `else if` after it; none when the chain ends in a plain else. */
const elseIfChain = (
  node: ESTree.IfStatement,
): Option.Option<ReadonlyArray<ESTree.IfStatement>> => {
  const chain = [node];
  let current = node;
  while (current.alternate?.type === "IfStatement") {
    current = current.alternate;
    chain.push(current);
  }
  if (Predicate.isNotNull(current.alternate)) return Option.none();
  return Option.some(chain);
};

const isCompleteIfTransformation = (node: ESTree.IfStatement): boolean => {
  if (isElseIf(node) || !isTerminalStatement(node)) return false;
  return Option.exists(elseIfChain(node), isDistinctTagDispatch);
};

/** Whether `previous` is a returning tag check on the same subject, so `node` does not start a run. */
const continuesRun = (
  previous: Option.Option<ESTree.Statement>,
  node: ESTree.IfStatement,
): boolean =>
  Option.exists(
    previous,
    (statement) =>
      isPlainIf(statement) &&
      statementReturns(statement.consequent) &&
      Option.exists(
        Option.all([tagComparison(statement.test), tagComparison(node.test)]),
        ([before, current]) => before.subject === current.subject,
      ),
  );

const isCompleteSequentialIfTransformation = (node: ESTree.IfStatement): boolean => {
  if (!isPlainIf(node) || node.parent?.type !== "BlockStatement") return false;
  const statements = node.parent.body;
  const index = statements.indexOf(node);
  if (index < 0) return false;
  const run = statements.slice(index);
  if (!run.every(isPlainIf) || continuesRun(Arr.get(statements, index - 1), node)) return false;
  return isDistinctTagDispatch(run);
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
        if (!isCompleteSwitchTransformation(node) || isInsideCatchAllHandler(node)) {
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
          (!isCompleteIfTransformation(node) && !isCompleteSequentialIfTransformation(node)) ||
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
