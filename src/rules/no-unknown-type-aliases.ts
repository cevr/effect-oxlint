/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

function referencedAliasName(type: ESTree.TSType): string | null {
  if (type.type === "TSParenthesizedType") return referencedAliasName(type.typeAnnotation);
  if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
  return type.typeArguments === null ||
    type.typeArguments === undefined ||
    type.typeArguments.params.length === 0
    ? type.typeName.name
    : null;
}

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
export const noUnknownTypeAliases = Rule.define({
  name: "no-unknown-type-aliases",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.",
    messages: {
      unknownAlias:
        "Type alias `{{alias}}` only renames `unknown`. Keep `unknown` explicit on an allowed `cause` field or replace it with the parsed owner type.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
    const resolvesToUnknown = (type: ESTree.TSType, visited = new Set<string>()): boolean => {
      if (type.type === "TSUnknownKeyword") return true;
      if (type.type === "TSParenthesizedType") {
        return resolvesToUnknown(type.typeAnnotation, visited);
      }
      const name = referencedAliasName(type);
      if (name === null || visited.has(name)) return false;
      const alias = aliases.get(name);
      if (
        alias === undefined ||
        (alias.typeParameters !== null && alias.typeParameters !== undefined)
      ) {
        return false;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(name);
      return resolvesToUnknown(alias.typeAnnotation, nextVisited);
    };
    return {
      Program: (node: ESTree.Program) => {
        for (const statement of node.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type === "TSTypeAliasDeclaration") {
            aliases.set(declaration.id.name, declaration);
          }
        }
        return Effect.forEach(
          aliases.values(),
          (alias) =>
            resolvesToUnknown(alias.typeAnnotation, new Set([alias.id.name]))
              ? context.report(
                  Diagnostic.fromId({
                    node: alias.id,
                    messageId: "unknownAlias",
                    data: { alias: alias.id.name },
                  }),
                )
              : Effect.void,
          { discard: true },
        );
      },
    };
  },
});
