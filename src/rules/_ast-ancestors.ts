/**
 * Parent navigation over the host AST. The host marks the root with a null
 * `parent`; these helpers lift that into Option so no rule compares against it.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

/** The node's parent, or none at the Program root. */
export const parentOf = (node: ESTree.Node): Option.Option<ESTree.Node> =>
  Option.fromNullishOr(node.parent);

/** The node's ancestors, nearest first, ending at the Program root. */
export function* ancestors(node: ESTree.Node): Iterable<ESTree.Node> {
  let current = parentOf(node);
  while (Option.isSome(current)) {
    yield current.value;
    current = parentOf(current.value);
  }
}
