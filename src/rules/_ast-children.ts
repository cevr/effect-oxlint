/**
 * Child-node access by property name, for AST walkers driven by visitor keys
 * or object keys. Reads through the property descriptor, so no walker has to
 * view a node as an open dictionary.
 */

import * as Predicate from "effect/Predicate";

/** Whether a value is an AST node: an object whose `type` is a string. */
export const isAstNode = (value: unknown): value is { readonly type: string } =>
  Predicate.hasProperty(value, "type") && Predicate.isString(value.type);

/** The nodes held at `node[key]`: the node itself, the nodes of an array, or none. */
export const childNodesAt = <N>(
  node: { readonly type: string },
  key: string,
  isNode: (value: unknown) => value is N,
): ReadonlyArray<N> => {
  const value: unknown = Object.getOwnPropertyDescriptor(node, key)?.value;
  if (isNode(value)) return [value];
  if (Array.isArray(value)) return value.filter(isNode);
  return [];
};
