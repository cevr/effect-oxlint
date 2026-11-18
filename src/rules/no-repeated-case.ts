/**
 * The same case is not repeated.
 *
 * Reported, in test modules: a case whose body text (whitespace aside) equals
 * the body of an earlier case in the same block, when the body reads no
 * variable bound between the file's top and the case: no parameter or local
 * of an enclosing `describe` callback or helper (locals of a nested
 * function, a sibling case among them, do not count), no loop variable. A body
 * that reads one runs with a different value each time (a parameterised
 * suite) and is a different test. Source: the owner's weak-test list "the
 * same case repeated" (catalog SR-T11).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf, contains, isFunction, walk } from "./_anti-slop-effect.js";
import { patternNames } from "./_loops.js";
import { statementOf, testCaseOf } from "./_test-cases.js";
import type { TestCase } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

const loopTypes: ReadonlySet<string> = new Set(["ForOfStatement", "ForInStatement"]);

/** Names an enclosing function or loop binds around a case, outside the case itself. */
const enclosingBindings = (testCase: TestCase): ReadonlySet<string> => {
  const names = new Set<string>();
  const add = (list: ReadonlyArray<string>) => list.forEach((name) => names.add(name));
  for (const ancestor of ancestorsOf(testCase.call)) {
    if (isFunction(ancestor)) {
      add(ancestor.params.flatMap(patternNames));
      walk(ancestor.body ?? ancestor, (node) => {
        if (isFunction(node)) return false;
        if (node.type === "VariableDeclarator") add(patternNames(node.id));
        return true;
      });
    }
    if (loopTypes.has(ancestor.type) && "left" in ancestor) add(patternNames(ancestor.left));
    if (ancestor.type === "ForStatement" && ancestor.init) add(patternNames(ancestor.init));
  }
  return names;
};

const readsAny = (node: ESTree.Node, names: ReadonlySet<string>): boolean =>
  names.size > 0 &&
  contains(node, (child) => child.type === "Identifier" && names.has(child.name));

export const noRepeatedCase = Rule.define({
  name: "no-repeated-case",
  meta: Rule.meta({
    type: "suggestion",
    description: "Remove a test case that repeats an earlier case's body in the same block.",
    docs: { recommended: false, preset: "skills-tests" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const bodyKey = (testCase: TestCase): string =>
      ctx.sourceCode.getText(testCase.fn.body ?? testCase.fn).replace(/\s+/gu, " ");

    const repeats = (program: ESTree.Program): ReadonlyArray<TestCase> => {
      const seen = new Map<ESTree.Node, Set<string>>();
      const found: Array<TestCase> = [];
      walk(program, (node) => {
        if (node.type !== "CallExpression") return true;
        Option.map(testCaseOf(node), (testCase) => {
          const block = statementOf(node).parent ?? program;
          const keys = seen.get(block) ?? new Set<string>();
          seen.set(block, keys);
          const key = bodyKey(testCase);
          const fixed = !readsAny(testCase.fn.body ?? testCase.fn, enclosingBindings(testCase));
          if (keys.has(key) && fixed) found.push(testCase);
          keys.add(key);
        });
        return true;
      });
      return found;
    };

    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          repeats(program),
          (testCase) =>
            ctx.report(
              Diagnostic.make({
                node: testCase.call,
                message:
                  "This case's body repeats an earlier case in the same block and reads nothing that differs between them, so it runs the same check twice and adds only time. Delete it, or make it test the other input its name promises.",
              }),
            ),
          { discard: true },
        ),
    };
  },
});
