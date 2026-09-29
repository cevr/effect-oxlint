/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

/** Resolve an identifier to its binding by walking lexical scopes upward. */
// Local change: returns Option instead of null.
export function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): Option.Option<Variable> {
  let scope: Option.Option<Scope> = Option.some(sourceCode.getScope(identifier));
  while (Option.isSome(scope)) {
    const variable = scope.value.set.get(identifier.name);
    if (Predicate.isNotUndefined(variable)) return Option.some(variable);
    scope = Option.fromNullishOr(scope.value.upper);
  }
  return Option.none();
}
