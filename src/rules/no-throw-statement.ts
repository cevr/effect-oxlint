/** Ban every throw statement. */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

export const noThrowStatement = Rule.define({
  name: "no-throw-statement",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid throw. Use Effect.fail with tagged errors.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      ThrowStatement: (node) =>
        ctx.report(
          Diagnostic.make({
            node,
            message:
              "Avoid throw. Model expected failures with tagged errors and explicit defects with Effect.die.",
          }),
        ),
    };
  },
});
