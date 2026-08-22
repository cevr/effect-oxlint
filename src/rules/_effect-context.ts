import type { ESTree } from "@oxlint/plugins";

import { isStaticCall, isStaticMember } from "./_effect-namespaces.js";

export type EffectProgramKind = "fn" | "fnUntraced" | "gen";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (node: ESTree.Node | null | undefined): node is FunctionNode =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

export const effectProgramKind = (
  node: FunctionNode,
  effectNamespaces: ReadonlySet<string>,
): EffectProgramKind | undefined => {
  const parent = node.parent;
  if (parent?.type !== "CallExpression" || !parent.arguments.includes(node)) return undefined;
  if (parent.callee.type !== "Super" && isStaticMember(parent.callee, effectNamespaces, "gen")) {
    return "gen";
  }
  if (parent.callee.type !== "Super" && isStaticMember(parent.callee, effectNamespaces, "fn")) {
    return "fn";
  }
  if (
    parent.callee.type !== "Super" &&
    isStaticMember(parent.callee, effectNamespaces, "fnUntraced")
  ) {
    return "fnUntraced";
  }
  if (parent.callee.type !== "CallExpression") return undefined;
  if (isStaticCall(parent.callee, effectNamespaces, "fn")) return "fn";
  if (isStaticCall(parent.callee, effectNamespaces, "fnUntraced")) return "fnUntraced";
  return undefined;
};

export const enclosingEffectProgram = (
  node: ESTree.Node,
  effectNamespaces: ReadonlySet<string>,
): readonly [FunctionNode, EffectProgramKind] | undefined => {
  let current: ESTree.Node | null | undefined = node.parent;
  while (current !== undefined && current !== null) {
    if (isFunction(current)) {
      const kind = effectProgramKind(current, effectNamespaces);
      if (kind === undefined) return undefined;
      return [current, kind];
    }
    current = current.parent;
  }
  return undefined;
};

export const isInsideEffectProgram = (
  node: ESTree.Node,
  effectNamespaces: ReadonlySet<string>,
): boolean => enclosingEffectProgram(node, effectNamespaces) !== undefined;
