/**
 * Ban `.makeUnsafe(...)` constructors.
 *
 * Unsafe constructors erase validation boundaries. Prefer safe constructors
 * that return Effect/Option or encode impossible failure in the owning module.
 */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export const noMakeUnsafe = Rule.define({
  name: "no-make-unsafe",
  meta: Rule.meta({
    type: "problem",
    description:
      "Avoid makeUnsafe constructors. Use safe Effectful or Option-returning construction.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression;
        if (call.callee.type !== "MemberExpression") return Effect.void;
        if (Option.isNone(AST.memberNames(call.callee))) return Effect.void;

        const names = Option.getOrUndefined(AST.memberNames(call.callee));
        if (names?.[1] !== "makeUnsafe") return Effect.void;

        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Do not call `.makeUnsafe(...)`. Use safe Effectful/Option-returning construction instead of bypassing validation.",
          }),
        );
      },
    };
  },
});
