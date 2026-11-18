/** Construct tagged values through their owning constructors instead of repeating `_tag`. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { staticProperties } from "./_call-arguments.js";
import { constResolver } from "./_const-bindings.js";

/** Schema fields are expressions too, but only a literal string represents a known tag value. */
const isStringTag = (node: ESTree.Expression): boolean =>
  (node.type === "Literal" && Predicate.isString(node.value)) ||
  (node.type === "TemplateLiteral" && node.expressions.length === 0);

/** Matchers that compare a partial pattern: a `_tag` there selects, it builds no value. */
const partialMatchers: ReadonlySet<string> = new Set(["toMatchObject", "objectContaining"]);

/** Whether the literal sits, through nested literals, in an argument of a partial matcher. */
const isPartialPattern = (node: ESTree.Node): boolean => {
  let child: ESTree.Node = node;
  for (let parent = child.parent; parent; child = parent, parent = parent.parent) {
    if (parent.type === "CallExpression") {
      if (child === parent.callee) return false;
      const callee = parent.callee;
      const name =
        callee.type === "Identifier"
          ? callee.name
          : callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier"
            ? callee.property.name
            : "";
      return partialMatchers.has(name);
    }
    if (
      parent.type !== "ObjectExpression" &&
      parent.type !== "ArrayExpression" &&
      parent.type !== "Property" &&
      parent.type !== "SpreadElement"
    )
      return false;
  }
  return false;
};

export const preferTaggedConstructors = Rule.define({
  name: "prefer-tagged-constructors",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Prefer schema constructors for tagged values; Data.taggedEnum and domain constructors are also supported.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const resolve = constResolver(context);
    return {
      ObjectExpression: (node: ESTree.ObjectExpression) => {
        const hasTag = staticProperties(node, "_tag").some(
          (property) => property.kind === "init" && isStringTag(resolve(property.value)),
        );
        if (!hasTag || isPartialPattern(node)) return Effect.void;
        return context.report(
          Diagnostic.make({
            node,
            message:
              "Prefer a schema constructor instead of a raw `_tag` object: a Schema.TaggedUnion case (Union.cases.Tag.make) or a Schema.TaggedStruct's .make. Data.taggedEnum for internal states and existing domain constructors are also valid.",
          }),
        );
      },
    };
  },
});
