/**
 * Declare tagged unions with Schema instead of hand-written `_tag` object types.
 *
 * A union of two or more type literals that each carry a `_tag` string
 * literal, such as `{ _tag: "Ok"; value: A } | { _tag: "Err"; error: E }`,
 * is a tagged union without constructors, guards, or a codec.
 * `Schema.TaggedUnion` (or `Schema.TaggedStruct` variants, or
 * `Schema.TaggedErrorClass` for failures) gives each variant a constructor,
 * `_tag` discrimination, and encoding for free.
 *
 * Every tag spelling counts: PascalCase, lowercase and kebab-case alike. A
 * wire tag such as `"tool-call"` is declared with `Schema.TaggedStruct`
 * variants joined by `Schema.toTaggedUnion`. One tagged object on its own, or
 * beside `undefined` or another non-literal member, is not a union of
 * variants. Only the inline type-literal form is reported; a union of named
 * aliases or interfaces is not.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

const propertyKeyName = (key: ESTree.PropertyKey): string => {
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && Predicate.isString(key.value)) return key.value;
  return "";
};

/** `_tag: "name"` with a non-empty string literal type. */
const isVariantTag = (member: ESTree.TSSignature): boolean => {
  if (member.type !== "TSPropertySignature" || propertyKeyName(member.key) !== "_tag") {
    return false;
  }
  const type = member.typeAnnotation?.typeAnnotation;
  return (
    type?.type === "TSLiteralType" &&
    type.literal.type === "Literal" &&
    Predicate.isString(type.literal.value) &&
    type.literal.value.length > 0
  );
};

const isTaggedTypeLiteral = (type: ESTree.TSType): boolean =>
  type.type === "TSTypeLiteral" && type.members.some(isVariantTag);

export const preferSchemaTaggedUnion = Rule.define({
  name: "prefer-schema-tagged-union",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Declare tagged unions with Schema.TaggedUnion instead of a union of hand-written `_tag` type literals.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      TSUnionType: (node: ESTree.TSUnionType) => {
        if (node.types.filter(isTaggedTypeLiteral).length < 2) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Hand-written `_tag` union. Declare it with Schema.TaggedUnion (Schema.TaggedStruct variants with Schema.toTaggedUnion for lowercase or kebab-case tags, or Schema.TaggedErrorClass for failures) so each variant gets a constructor, guard, and codec.",
          }),
        );
      },
    };
  },
});
