/**
 * React 19 reads a context with `use(Context)`, not `useContext(Context)`.
 *
 * Reported: a `useContext(…)` or `React.useContext(…)` call outside test
 * modules. Enable it in a React 19 project. Source: the composition skill,
 * `react19-no-forwardref` ("`use()` in place of `useContext()`") (catalog
 * SR-R13).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isReactCall } from "./_react.js";
import { isTestModule, skipFile } from "./_test-files.js";

export const preferUse = Rule.define({
  name: "prefer-use",
  meta: Rule.meta({
    type: "suggestion",
    description: "Read a context with use(Context) (React 19) instead of useContext(Context).",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (!isReactCall(node, "useContext")) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "In React 19, `use(Context)` reads a context and, unlike `useContext`, may be called inside a condition or a loop, so one accessor serves both. Write `use(Context)`.",
          }),
        );
      },
    };
  },
});
