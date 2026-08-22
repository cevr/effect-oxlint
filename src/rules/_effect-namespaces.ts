import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

import { Scope } from "../vendor/effect-oxlint/index.js";
import type { RuleContext } from "../vendor/effect-oxlint/index.js";

export const importedNamespaces = (
  node: ESTree.ImportDeclaration,
  exportName: string,
  directModule: string,
): ReadonlyArray<string> => {
  const source = node.source.value;
  if (source !== "effect" && source !== directModule) return [];

  const namespaces: Array<string> = [];
  for (const specifier of node.specifiers) {
    if (specifier.type === "ImportNamespaceSpecifier" && source === directModule) {
      namespaces.push(specifier.local.name);
      continue;
    }
    if (
      specifier.type === "ImportSpecifier" &&
      source === "effect" &&
      specifier.imported.type === "Identifier" &&
      specifier.imported.name === exportName
    ) {
      namespaces.push(specifier.local.name);
    }
  }
  return namespaces;
};

export const visibleNamespaces = (
  ctx: RuleContext["Service"],
  node: ESTree.Node,
  namespaces: ReadonlySet<string>,
): ReadonlySet<string> =>
  new Set(
    [...namespaces].filter((namespace) =>
      Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), namespace), {
        onNone: () => true,
        onSome: (variable) =>
          variable.defs.some((definition) => definition.type === "ImportBinding"),
      }),
    ),
  );

export const isStaticMember = (
  node: ESTree.Expression,
  namespaces: ReadonlySet<string>,
  property: string,
): node is ESTree.MemberExpression =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.object.type === "Identifier" &&
  namespaces.has(node.object.name) &&
  node.property.type === "Identifier" &&
  node.property.name === property;

export const isStaticCall = (
  node: ESTree.Expression,
  namespaces: ReadonlySet<string>,
  property: string,
): node is ESTree.CallExpression =>
  node.type === "CallExpression" &&
  node.callee.type !== "Super" &&
  isStaticMember(node.callee, namespaces, property);
