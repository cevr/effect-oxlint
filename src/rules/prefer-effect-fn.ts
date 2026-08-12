/** Require Effect.fn for named generator operations. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";

const isStaticMember = (
  node: ESTree.Expression,
  objects: ReadonlySet<string>,
  property: string,
): node is ESTree.MemberExpression =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.object.type === "Identifier" &&
  objects.has(node.object.name) &&
  node.property.type === "Identifier" &&
  node.property.name === property;

const isEffectGenCall = (
  node: ESTree.Expression,
  effectNamespaces: ReadonlySet<string>,
): node is ESTree.CallExpression =>
  node.type === "CallExpression" &&
  node.callee.type !== "Super" &&
  isStaticMember(node.callee, effectNamespaces, "gen");

const isEffectWithSpanCall = (
  node: ESTree.CallExpression["arguments"][number],
  effectNamespaces: ReadonlySet<string>,
): boolean =>
  node.type === "CallExpression" &&
  node.callee.type !== "Super" &&
  isStaticMember(node.callee, effectNamespaces, "withSpan");

const spansEffectGenDirectly = (
  node: ESTree.CallExpression,
  effectNamespaces: ReadonlySet<string>,
): boolean =>
  node.callee.type !== "Super" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === "withSpan" &&
  isEffectGenCall(node.callee.object, effectNamespaces);

const pipesWithSpanFromEffectGen = (
  node: ESTree.CallExpression,
  effectNamespaces: ReadonlySet<string>,
): boolean =>
  node.callee.type !== "Super" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === "pipe" &&
  isEffectGenCall(node.callee.object, effectNamespaces) &&
  node.arguments.some((argument) => isEffectWithSpanCall(argument, effectNamespaces));

const effectNamespaceFromImport = (node: ESTree.ImportDeclaration): ReadonlyArray<string> => {
  const source = node.source.value;
  if (source !== "effect" && source !== "effect/Effect") return [];

  const namespaces: Array<string> = [];
  for (const specifier of node.specifiers) {
    if (specifier.type === "ImportNamespaceSpecifier" && source === "effect/Effect") {
      namespaces.push(specifier.local.name);
      continue;
    }
    if (
      specifier.type === "ImportSpecifier" &&
      source === "effect" &&
      specifier.imported.type === "Identifier" &&
      specifier.imported.name === "Effect"
    ) {
      namespaces.push(specifier.local.name);
    }
  }
  return namespaces;
};

export const preferEffectFn = Rule.define({
  name: "prefer-effect-fn",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use Effect.fn for a named generator operation.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set<string>();
    const visibleEffectNamespaces = (node: ESTree.Node): ReadonlySet<string> =>
      new Set(
        [...effectNamespaces].filter((namespace) =>
          Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), namespace), {
            onNone: () => true,
            onSome: (variable) =>
              variable.defs.some((definition) => definition.type === "ImportBinding"),
          }),
        ),
      );

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const namespace of effectNamespaceFromImport(node)) effectNamespaces.add(namespace);
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        const namespaces = visibleEffectNamespaces(node);
        if (
          !spansEffectGenDirectly(node, namespaces) &&
          !pipesWithSpanFromEffectGen(node, namespaces)
        ) {
          return Effect.void;
        }
        return ctx.report(
          Diagnostic.make({
            node,
            message: "Avoid a span on Effect.gen. Define the named operation with Effect.fn.",
          }),
        );
      },
    };
  },
});
