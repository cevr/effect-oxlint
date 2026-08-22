/** Do not silently erase every failure with Effect.void. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

type Handler = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (
  node: ESTree.CallExpression["arguments"][number] | undefined,
): node is Handler =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const isEffectVoid = (node: ESTree.Expression, effectNamespaces: ReadonlySet<string>): boolean =>
  isStaticMember(node, effectNamespaces, "void");

const silentlyReturnsVoid = (node: Handler, effectNamespaces: ReadonlySet<string>): boolean => {
  if (node.params.length !== 0 || node.body === null) return false;
  if (node.body.type !== "BlockStatement") return isEffectVoid(node.body, effectNamespaces);
  if (node.body.body.length !== 1) return false;
  const statement = node.body.body[0];
  return (
    statement?.type === "ReturnStatement" &&
    statement.argument !== null &&
    isEffectVoid(statement.argument, effectNamespaces)
  );
};

const handlerArgument = (
  node: ESTree.CallExpression,
): ESTree.CallExpression["arguments"][number] | undefined => {
  if (node.arguments.length === 1) return node.arguments[0];
  return node.arguments[1];
};

export const noSilentCatchAll = Rule.define({
  name: "no-silent-catch-all",
  meta: Rule.meta({
    type: "problem",
    description: "Do not silently erase every failure with Effect.void.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        const catchesAll =
          isStaticMember(node.callee, namespaces, "catchAll") ||
          isStaticMember(node.callee, namespaces, "catchAllCause");
        if (!catchesAll) return Effect.void;
        const handler = handlerArgument(node);
        if (!isFunction(handler) || !silentlyReturnsVoid(handler, namespaces)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node: handler,
            message:
              "Do not erase every failure with Effect.void. Recover a typed failure truthfully or record the unexpected failure before recovery.",
          }),
        );
      },
    };
  },
});
