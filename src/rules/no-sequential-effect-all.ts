/** Use explicit sequencing when Effect.all discards a serial result. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const propertyLiteral = (
  node: ESTree.CallExpression["arguments"][number] | undefined,
  name: string,
): string | number | boolean | null | undefined => {
  if (node?.type !== "ObjectExpression") return undefined;
  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const matches =
      (property.key.type === "Identifier" && property.key.name === name) ||
      (property.key.type === "Literal" && property.key.value === name);
    if (matches && property.value.type === "Literal") {
      const value = property.value.value;
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return value;
      }
    }
  }
  return undefined;
};

const pipedToAsVoid = (
  node: ESTree.CallExpression,
  effectNamespaces: ReadonlySet<string>,
): boolean => {
  const member = node.parent;
  if (
    member?.type !== "MemberExpression" ||
    member.object !== node ||
    member.computed ||
    member.property.type !== "Identifier" ||
    member.property.name !== "pipe"
  ) {
    return false;
  }
  const pipe = member.parent;
  if (pipe?.type !== "CallExpression") return false;
  for (const operation of pipe.arguments) {
    if (operation.type === "SpreadElement") continue;
    if (isStaticMember(operation, effectNamespaces, "asVoid")) return true;
  }
  return false;
};

export const noSequentialEffectAll = Rule.define({
  name: "no-sequential-effect-all",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use explicit sequencing instead of a serial Effect.all whose result is discarded.",
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
        if (!isStaticMember(node.callee, namespaces, "all")) return Effect.void;
        if (node.arguments[0]?.type !== "ArrayExpression") return Effect.void;
        const options = node.arguments[1];
        if (propertyLiteral(options, "concurrency") !== 1) return Effect.void;
        const discards =
          propertyLiteral(options, "discard") === true || pipedToAsVoid(node, namespaces);
        if (!discards) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Use Effect.andThen or one flat generator for sequential steps. Reserve Effect.all for value aggregation or real concurrency.",
          }),
        );
      },
    };
  },
});
