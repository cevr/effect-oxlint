import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

import { Scope } from "../vendor/effect-oxlint/index.js";
import type { RuleContext } from "../vendor/effect-oxlint/index.js";

/** Follows an identifier to the initializer of its const binding; other expressions stay as they are. */
export type ResolveConst = (node: ESTree.Expression) => ESTree.Expression;

/** Strips type-only wrappers such as `as const`, `satisfies`, and `!`. */
const unwrapTypeSyntax = (node: ESTree.Expression): ESTree.Expression => {
  let current = node;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSSatisfiesExpression"
  ) {
    current = current.expression;
  }
  return current;
};

/** The initializer of a single, never reassigned const binding. */
const constInitializer = (
  ctx: RuleContext["Service"],
  node: ESTree.IdentifierReference,
): Option.Option<ESTree.Expression> =>
  Option.flatMap(Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name), (variable) => {
    const definition = variable.defs[0];
    if (variable.defs.length !== 1 || definition?.node.type !== "VariableDeclarator") {
      return Option.none();
    }
    const declarator = definition.node;
    if (declarator.parent.type !== "VariableDeclaration" || declarator.parent.kind !== "const") {
      return Option.none();
    }
    return Option.fromNullishOr(declarator.init);
  });

/**
 * A value held in a const is checked like the inline value, through type-only wrappers.
 * Unresolved identifiers, such as parameters, stay as they are. `seen` stops a self-referential chain.
 */
export const constResolver = (ctx: RuleContext["Service"]): ResolveConst => {
  const resolveWith =
    (seen: ReadonlySet<ESTree.IdentifierReference>): ResolveConst =>
    (expression) => {
      const node = unwrapTypeSyntax(expression);
      if (node.type !== "Identifier" || seen.has(node)) return node;
      return Option.match(constInitializer(ctx, node), {
        onNone: () => node,
        onSome: (init) => resolveWith(new Set([...seen, node]))(init),
      });
    };
  return resolveWith(new Set());
};
