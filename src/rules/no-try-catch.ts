/** Ban every try statement, including catch and finally variants. */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

export const noTryCatch = Rule.define({
  name: "no-try-catch",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid try/catch/finally blocks. Use Effect error handling and finalization operators.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      TryStatement: (node) =>
        ctx.report(
          Diagnostic.make({
            node,
            message:
              "Avoid try/catch/finally. Use Effect.try or Effect.tryPromise for failures and Effect.ensuring or Effect.acquireUseRelease for finalization.",
          }),
        ),
    };
  },
});
