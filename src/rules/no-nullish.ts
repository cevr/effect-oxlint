/** Ban explicit `null` and `undefined` values and types. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext, SourceCode } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const message =
  "Avoid null and undefined. Use Option for presence or absence. Use a domain enum when the state has more than two cases.";

const isNullPrototypeArgument = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  return (
    parent?.type === "CallExpression" &&
    parent.arguments[0] === node &&
    parent.callee.type === "MemberExpression" &&
    AST.isMember(parent.callee, "Object", "create")
  );
};

export const noNullish = Rule.define({
  name: "no-nullish",
  meta: Rule.meta({
    type: "problem",
    description: "Use Option or a domain enum instead of null and undefined.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const report = (node: ESTree.Node) => ctx.report(Diagnostic.make({ node, message }));

    return {
      Identifier: (node) =>
        Option.match(AST.narrow(node, "Identifier"), {
          onNone: () => Effect.void,
          onSome: (identifier) => {
            if (identifier.name !== "undefined") return Effect.void;
            return SourceCode.isGlobalReference(identifier).pipe(
              Effect.flatMap((isGlobal) => {
                if (!isGlobal) return Effect.void;
                return report(identifier);
              }),
            );
          },
        }),
      Literal: (node) =>
        Option.match(AST.narrow(node, "Literal"), {
          onNone: () => Effect.void,
          onSome: (literal) =>
            literal.value === null &&
            !("regex" in literal) &&
            !isNullPrototypeArgument(literal)
              ? report(literal)
              : Effect.void,
        }),
      TSNullKeyword: (node) =>
        Option.match(AST.narrow(node, "TSNullKeyword"), {
          onNone: () => Effect.void,
          onSome: report,
        }),
      TSUndefinedKeyword: (node) =>
        Option.match(AST.narrow(node, "TSUndefinedKeyword"), {
          onNone: () => Effect.void,
          onSome: report,
        }),
    };
  },
});
