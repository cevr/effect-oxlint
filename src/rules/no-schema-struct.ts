/**
 * Ban `Schema.Struct(...)`.
 *
 * Effect v4 domain models should use `Schema.Class` so the schema and
 * constructor stay together.
 */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export const noSchemaStruct = Rule.define({
  name: "no-schema-struct",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use Schema.Class instead of Schema.Struct.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression;
        if (Option.isNone(AST.matchCallOf(call, "Schema", "Struct"))) return Effect.void;

        return ctx.report(
          Diagnostic.make({
            node,
            message: "Use Schema.Class instead of Schema.Struct.",
          }),
        );
      },
    };
  },
});
