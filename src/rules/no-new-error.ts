/** Ban native Error construction except as the direct input to a defect constructor. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const nativeErrors = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
]);

const defectNamespaces = new Set(["Effect", "Cause", "Exit"]);

const isDirectDefectArgument = (node: ESTree.NewExpression): boolean => {
  const parent = node.parent;
  if (parent?.type !== "CallExpression" || !parent.arguments.includes(node)) return false;
  const callee = parent.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  if (callee.object.type !== "Identifier" || callee.property.type !== "Identifier") return false;
  return defectNamespaces.has(callee.object.name) && callee.property.name === "die";
};

export const noNewError = Rule.define({
  name: "no-new-error",
  meta: Rule.meta({
    type: "suggestion",
    description: "Reserve native Error values for explicit Effect defects.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      NewExpression: (node) =>
        Option.match(AST.narrow(node, "NewExpression"), {
          onNone: () => Effect.void,
          onSome: (expression) => {
            if (
              expression.callee.type !== "Identifier" ||
              !nativeErrors.has(expression.callee.name) ||
              isDirectDefectArgument(expression)
            ) {
              return Effect.void;
            }
            return ctx.report(
              Diagnostic.make({
                node: expression,
                message:
                  "Avoid native Error constructors for expected failures. Use a tagged error, or pass the Error directly to Effect.die, Cause.die, or Exit.die for an explicit defect.",
              }),
            );
          },
        }),
    };
  },
});
