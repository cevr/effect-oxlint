/**
 * A test case can fail: an empty body cannot.
 *
 * Reported, in test modules: a case (`it`, `test` and their modifiers, not
 * `.todo`) whose function has an empty block body. It always passes and is
 * counted as coverage. A case whose assertion lives in a helper or a wait is
 * not judged here: a per-file rule cannot see into the helper (catalog
 * SR-T10, its exact form). Source: the owner's weak-test list "no assertion
 * at all".
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { testCaseOf } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

export const noEmptyTest = Rule.define({
  name: "no-empty-test",
  meta: Rule.meta({
    type: "suggestion",
    description: "Give every test case a body that can fail, or declare it with it.todo.",
    docs: { recommended: false, preset: "skills-tests" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(
          Option.filter(
            testCaseOf(node),
            ({ fn }) => fn.body?.type === "BlockStatement" && fn.body.body.length === 0,
          ),
          {
            onNone: () => Effect.void,
            onSome: () =>
              ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "This case has an empty body, so it passes whatever the code does and still counts as a test. Assert the outcome it names, or declare it with `it.todo(\"…\")` until it is written.",
                }),
              ),
          },
        ),
    };
  },
});
