/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  createTypeAliasEnvironment,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "./_anti-slop-type-alias-resolution.js";

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
    let environment: TypeAliasEnvironment | null = null;

    const resolvesToUnknown = (type: ESTree.TSType): boolean =>
      environment !== null &&
      resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === "TSUnknownKeyword") return true;
        if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation);
        return resolved.type === "TSUnionType" && resolved.types.some(matches);
      });

    return {
      Program: (node: ESTree.Program) => {
        environment = createTypeAliasEnvironment(node, context.sourceCode.visitorKeys);
        return Effect.void;
      },
      TSTypeAliasDeclaration: (node: ESTree.TSTypeAliasDeclaration) =>
        resolvesToUnknown(node.typeAnnotation)
          ? context.report(
              Diagnostic.fromId({
                node: node.id,
                messageId: "unknownAlias",
                data: { alias: node.id.name },
              }),
            )
          : Effect.void,
    };
  },
});
