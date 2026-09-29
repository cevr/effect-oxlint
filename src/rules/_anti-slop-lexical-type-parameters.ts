/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { ancestors } from "./_ast-ancestors.js";
import { childNodesAt, isAstNode } from "./_ast-children.js";

type VisitorKeys = Readonly<Record<string, readonly string[]>>;

// Local change: the node test is the shared isAstNode instead of runtime typeof checks.
function isNode(value: unknown): value is ESTree.Node {
  return isAstNode(value);
}

function collectInferTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  names: Set<string>,
): void {
  if (node.type === "TSInferType") names.add(node.typeParameter.name.name);
  // Local change: children are read through childNodesAt instead of a dictionary cast.
  for (const key of visitorKeys[node.type] ?? []) {
    for (const child of childNodesAt(node, key, isNode)) {
      collectInferTypeParameterNames(child, visitorKeys, names);
    }
  }
}

/** Collect type binders that are in scope at a node and can shadow module aliases. */
// Local change: walks the node and its ancestors() instead of a nullable parent loop.
export function lexicalTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
): ReadonlySet<string> {
  const names = new Set<string>();
  let descendant: ESTree.Node = node;
  for (const current of [node, ...ancestors(node)]) {
    if (current.type === "Program") break;
    if ("typeParameters" in current) {
      for (const parameter of current.typeParameters?.params ?? []) {
        names.add(parameter.name.name);
      }
    }
    if (
      current.type === "TSMappedType" &&
      (descendant === current.nameType || descendant === current.typeAnnotation)
    ) {
      names.add(current.key.name);
    }
    if (current.type === "TSConditionalType" && descendant === current.trueType) {
      collectInferTypeParameterNames(current.extendsType, visitorKeys, names);
    }
    descendant = current;
  }
  return names;
}
