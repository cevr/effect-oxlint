/**
 * Ban TypeScript type assertions, except the const assertion.
 *
 * Both spellings assert: `x as T` and the angle-bracket `<T>x` of `.ts`
 * files. `as const` and `<const>x` stay allowed.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

type Assertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

// `as const` asserts nothing: it narrows a literal to its own readonly type,
// which no `satisfies` can express without restating the type by hand.
const isConstAssertion = ({ typeAnnotation }: Assertion): boolean =>
  typeAnnotation.type === "TSTypeReference" &&
  typeAnnotation.typeName.type === "Identifier" &&
  typeAnnotation.typeName.name === "const";

export const noAs = Rule.define({
  name: "no-as",
  meta: Rule.meta({
    type: "problem",
    description:
      "Use satisfies instead of an `as` or angle-bracket assertion; `as const` is allowed.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    const check = (node: Assertion) => {
      if (isConstAssertion(node)) return Effect.void;
      return ctx.report(
        Diagnostic.make({
          node,
          message: "Avoid as assertions. Use satisfies instead.",
        }),
      );
    };

    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
});
