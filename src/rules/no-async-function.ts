/** Ban async functions and await expressions. */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

export const noAsyncFunction = Rule.define({
  name: "no-async-function",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid async/await. Compose asynchronous work with Effect.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const report = (node: Parameters<typeof Diagnostic.make>[0]["node"]) =>
      ctx.report(
        Diagnostic.make({
          node,
          message:
            "Avoid async functions. Use Effect.gen with Effect.promise or Effect.tryPromise.",
        }),
      );

    return {
      FunctionDeclaration: (node) => {
        if ("async" in node && node.async === true) return report(node);
        return Effect.void;
      },
      FunctionExpression: (node) => {
        if ("async" in node && node.async === true) return report(node);
        return Effect.void;
      },
      ArrowFunctionExpression: (node) => {
        if ("async" in node && node.async === true) return report(node);
        return Effect.void;
      },
      AwaitExpression: (node) =>
        ctx.report(
          Diagnostic.make({
            node,
            message: "Avoid await. Yield Effect.promise or Effect.tryPromise inside Effect.gen.",
          }),
        ),
    };
  },
});
