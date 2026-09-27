/** Ban TypeScript `as` assertions, except `as const`. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

// `as const` asserts nothing: it narrows a literal to its own readonly type,
// which no `satisfies` can express without restating the type by hand.
const isConstAssertion = (node: ESTree.Node): boolean =>
  Option.exists(
    AST.narrow(node, "TSAsExpression"),
    ({ typeAnnotation }) =>
      typeAnnotation.type === "TSTypeReference" &&
      typeAnnotation.typeName.type === "Identifier" &&
      typeAnnotation.typeName.name === "const",
  );

export const noAs = Rule.define({
  name: "no-as",
  meta: Rule.meta({
    type: "problem",
    description: "Use satisfies instead of an as assertion; `as const` is allowed.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    return {
      TSAsExpression: (node) => {
        if (isConstAssertion(node)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: "Avoid as assertions. Use satisfies instead.",
          }),
        );
      },
    };
  },
});
