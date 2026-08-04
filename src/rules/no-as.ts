/** Ban TypeScript `as` assertions. */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

export const noAs = Rule.define({
  name: "no-as",
  meta: Rule.meta({
    type: "problem",
    description: "Use satisfies instead of an as assertion.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    return {
      TSAsExpression: (node) =>
        ctx.report(
          Diagnostic.make({
            node,
            message: "Avoid as assertions. Use satisfies instead.",
          }),
        ),
    };
  },
});
