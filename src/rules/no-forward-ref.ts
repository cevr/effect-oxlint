/**
 * React 19 passes `ref` as a prop: no `forwardRef`.
 *
 * Reported: a `forwardRef(…)` or `React.forwardRef(…)` call outside test
 * modules. Enable it in a React 19 project; earlier React needs the wrapper.
 * Source: the composition skill, `react19-no-forwardref` (catalog SR-R13).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isReactCall } from "./_react.js";
import { isTestModule, skipFile } from "./_test-files.js";

export const noForwardRef = Rule.define({
  name: "no-forward-ref",
  meta: Rule.meta({
    type: "suggestion",
    description: "Take ref as a prop (React 19) instead of wrapping a component in forwardRef.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (!isReactCall(node, "forwardRef")) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "React 19 passes `ref` to a function component as an ordinary prop, so `forwardRef` only adds a wrapper and a second component name in the tree. Declare the component as `function Input({ ref, ...props }: Props & { ref?: React.Ref<HTMLInputElement> })` and pass `ref` on.",
          }),
        );
      },
    };
  },
});
