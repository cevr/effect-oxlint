/**
 * A test does not assert that a constant equals the literal it was defined
 * as.
 *
 * Reported, in test modules: a case whose every expectation is `toBe`,
 * `toEqual` or `toStrictEqual` of a literal, with a subject that is a bare
 * constant name (`UPPER_CASE`) or a literal. Such a case passes by
 * construction: it re-states the source, fails on every intended edit and
 * on no bug. A member of a constant (`FIXTURE.viewer.canEdit`) is not
 * reported: whether it holds a literal is in another file. A case under a
 * `contract: <reason>` comment (a value pinned for parity with another
 * system) is left alone. Source: the owner's weak-test list; writing-tests
 * "Tautological… passes by construction" (catalog SR-T07).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { contractNote, expectationsIn, statementOf, testCaseOf } from "./_test-cases.js";
import type { Expectation } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

const equalityMatchers: ReadonlySet<string> = new Set(["toBe", "toEqual", "toStrictEqual"]);
const constantName = /^[A-Z][A-Z0-9_]*$/u;

const isLiteral = (node: ESTree.Node): boolean => {
  if (node.type === "Literal") return true;
  if (node.type === "TemplateLiteral") return node.expressions.length === 0;
  return (
    node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal"
  );
};

const isRestated = (expectation: Expectation): boolean =>
  equalityMatchers.has(expectation.matcher) &&
  Option.exists(expectation.expected, isLiteral) &&
  Option.exists(
    expectation.subject,
    (subject) =>
      isLiteral(subject) || (subject.type === "Identifier" && constantName.test(subject.name)),
  );

export const noConstantRestated = Rule.define({
  name: "no-constant-restated",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Test what a constant does, not that it equals the literal it was defined as.",
    docs: { recommended: false, preset: "skills-tests" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(testCaseOf(node), {
          onNone: () => Effect.void,
          onSome: (testCase) => {
            const expectations = expectationsIn(testCase.fn);
            const restated = expectations.length > 0 && expectations.every(isRestated);
            const noted = Arr.some(ctx.sourceCode.getCommentsBefore(statementOf(node)), (c) =>
              contractNote.test(c.value),
            );
            if (!restated || noted) return Effect.void;
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Every expectation here compares a constant (or a literal) with a literal, so the case passes by construction: it fails on each intended edit of the value and on no bug. Test what the constant governs (`expect(wait(RETRY_LIMIT_MS + 1)).toEqual({ _tag: \"TimedOut\" })`), or mark a value pinned on purpose with a `// contract: <reason>` comment.",
              }),
            );
          },
        }),
    };
  },
});
