/**
 * Ban inline hand-rolled `_tag` discriminated unions.
 *
 * Use Schema.TaggedUnion / Schema.TaggedStruct / Schema.TaggedErrorClass so
 * constructors, encode/decode, and tag discrimination share one schema source.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const getNodeField = (node: AstNode, field: string): AstNode | undefined => {
  const value = node[field];
  return isAstNode(value) ? value : undefined;
};

const getStringField = (node: AstNode, field: string): string | undefined => {
  const value = node[field];
  return typeof value === "string" ? value : undefined;
};

const getNodeArrayField = (node: AstNode, field: string): ReadonlyArray<AstNode> | undefined => {
  const value = node[field];
  return Array.isArray(value) ? value.filter(isAstNode) : undefined;
};

const getPropertyKeyName = (node: AstNode): string | undefined => {
  if (node.type === "Identifier" || node.type === "StringLiteral" || node.type === "Literal") {
    return getStringField(node, "name") ?? getStringField(node, "value");
  }
  return undefined;
};

const isPascalCaseTag = (value: string): boolean => {
  if (value.length === 0) return false;
  const first = value.charAt(0);
  return first === first.toUpperCase() && first !== first.toLowerCase();
};

const isReportableTagLiteral = (member: AstNode): boolean => {
  if (member.type !== "TSPropertySignature") return false;
  const key = getNodeField(member, "key");
  if (key === undefined || getPropertyKeyName(key) !== "_tag") return false;

  const annotation = getNodeField(member, "typeAnnotation");
  const inner = annotation === undefined ? undefined : getNodeField(annotation, "typeAnnotation");
  if (inner?.type !== "TSLiteralType") return false;

  const literal = getNodeField(inner, "literal");
  if (literal === undefined) return false;
  if (literal.type !== "StringLiteral" && literal.type !== "Literal") return false;

  const value = getStringField(literal, "value");
  return value !== undefined && isPascalCaseTag(value);
};

const literalHasTag = (node: AstNode): boolean => {
  if (node.type !== "TSTypeLiteral") return false;
  const members = getNodeArrayField(node, "members");
  return members !== undefined && members.some(isReportableTagLiteral);
};

export const noHandRolledTaggedUnion = Rule.define({
  name: "no-hand-rolled-tagged-union",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use Schema.TaggedUnion, Schema.TaggedStruct, or Schema.TaggedErrorClass instead of inline _tag union literals.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      TSUnionType: (node: ESTree.Node) => {
        const union = node as unknown as AstNode;
        const types = getNodeArrayField(union, "types");
        if (types === undefined || types.length < 2) return Effect.void;

        let tagged = 0;
        for (const type of types) {
          if (literalHasTag(type)) tagged += 1;
          if (tagged >= 2) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Hand-rolled `_tag` discriminated union. Use Schema.TaggedUnion, Schema.TaggedStruct, or Schema.TaggedErrorClass instead.",
              }),
            );
          }
        }

        return Effect.void;
      },
    };
  },
});
