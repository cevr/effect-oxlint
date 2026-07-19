/** Ban the global Promise constructor and its static APIs. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const isPromiseIdentifier = (node: ESTree.Node): boolean =>
  node.type === "Identifier" && "name" in node && node.name === "Promise";

export const noNewPromise = Rule.define({
  name: "no-new-promise",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid Promise APIs. Use Effect concurrency and promise boundaries.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      ctx.report(
        Diagnostic.make({
          node,
          message:
            "Avoid Promise APIs. Use Effect.async for callbacks and Effect.promise or Effect.tryPromise at promise boundaries.",
        }),
      );

    return {
      NewExpression: (node) =>
        Option.match(AST.narrow(node, "NewExpression"), {
          onNone: () => Effect.void,
          onSome: (expression) =>
            isPromiseIdentifier(expression.callee) ? report(expression) : Effect.void,
        }),
      CallExpression: (node) =>
        Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: (call) => {
            if (isPromiseIdentifier(call.callee)) return report(call);
            if (call.callee.type !== "MemberExpression") return Effect.void;
            const member = Option.getOrUndefined(AST.memberNames(call.callee));
            return member?.[0] === "Promise" ? report(call) : Effect.void;
          },
        }),
    };
  },
});
