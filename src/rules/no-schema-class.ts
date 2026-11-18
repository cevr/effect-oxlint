/**
 * App data is a `Schema.Struct` with a same-name `interface`, not a
 * `Schema.Class` or `Schema.TaggedClass`.
 *
 * Reported: a class that extends `Schema.Class<…>(…)(…)` or
 * `Schema.TaggedClass<…>()(…)`, outside test modules. `Schema.TaggedError`
 * stays legal: a failure is a class. Source: the effect skill, Do Nots, and
 * "Model records with `Schema.Struct(...)` plus a same-name `interface`"
 * (catalog SR-E02).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";

const schemaClass = /^Schema\.(Class|TaggedClass)\b/u;

export const noSchemaClass = Rule.define({
  name: "no-schema-class",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Model app data with Schema.Struct and a same-name interface, not Schema.Class or Schema.TaggedClass.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (node: ESTree.Class) =>
      Option.match(
        Option.flatMap(Option.fromNullishOr(node.superClass), (base) =>
          Option.fromNullishOr(schemaClass.exec(ctx.sourceCode.getText(base))?.[1]),
        ),
        {
          onNone: () => Effect.void,
          onSome: (kind) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`Schema.${kind}\` makes app data a class: values carry a prototype, equality and construction rules that plain data does not need, and the type and the schema drift apart in tests and across a wire. Declare \`export const Note = Schema.Struct({ … })\` and \`export interface Note extends Schema.Schema.Type<typeof Note> {}\`; keep classes for failures (\`Schema.TaggedError\`) and services.`,
              }),
            ),
        },
      );
    return {
      ClassDeclaration: (node: ESTree.Class) => check(node),
      ClassExpression: (node: ESTree.Class) => check(node),
    };
  },
});
