/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  createTypeEnvironment,
  type TypeEnvironment,
} from "./_anti-slop-dictionary-types.js";
import { visibleTypeAlias } from "./_anti-slop-type-alias-resolution.js";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

const typeNodeKinds: ReadonlySet<string> = new Set([
  "JSDocNonNullableType",
  "JSDocNullableType",
  "JSDocUnknownType",
  "TSAnyKeyword",
  "TSArrayType",
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSConditionalType",
  "TSConstructorType",
  "TSFunctionType",
  "TSImportType",
  "TSIndexedAccessType",
  "TSInferType",
  "TSIntersectionType",
  "TSIntrinsicKeyword",
  "TSLiteralType",
  "TSMappedType",
  "TSNamedTupleMember",
  "TSNeverKeyword",
  "TSNullKeyword",
  "TSNumberKeyword",
  "TSObjectKeyword",
  "TSParenthesizedType",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSTemplateLiteralType",
  "TSThisType",
  "TSTupleType",
  "TSTypeLiteral",
  "TSTypeOperator",
  "TSTypePredicate",
  "TSTypeQuery",
  "TSTypeReference",
  "TSUndefinedKeyword",
  "TSUnionType",
  "TSUnknownKeyword",
  "TSVoidKeyword",
]);

function isTypeNode(node: ESTree.Node): node is ESTree.TSType {
  return typeNodeKinds.has(node.type);
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function isInsideTypeAliasDeclaration(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (current.type === "TSTypeAliasDeclaration") return true;
    current = current.parent;
  }
  return false;
}

function isPlainAliasConsumerUse(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (node.type !== "TSTypeReference" || node.typeArguments?.params.length) return false;
  const name = typeReferenceName(node);
  return (
    name !== null &&
    visibleTypeAlias(name, node, environment.typeAliases) !== null &&
    !isInsideTypeAliasDeclaration(node)
  );
}

function isInsideTypeParameterConstraint(node: ESTree.TSType): boolean {
  let child: ESTree.Node = node;
  let parent: ESTree.Node | null = child.parent;
  while (parent !== null && parent.type !== "Program") {
    if (parent.type === "TSTypeParameter" && parent.constraint === child) return true;
    child = parent;
    parent = child.parent;
  }
  return false;
}

function shouldReportType(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (isInsideTypeParameterConstraint(node)) return false;
  if (isPlainAliasConsumerUse(node, environment)) return false;
  if (classifyUnsafeDictionary(node, environment) === null) return false;
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (isTypeNode(current) && classifyUnsafeDictionary(current, environment) !== null)
      return false;
    current = current.parent;
  }
  return true;
}

/** Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch. */
export const noUnsafeDictionaryType = Rule.define({
  name: "no-unsafe-dictionary-type",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.",
    messages: {
      unsafeDictionary:
        "This object dictionary's direct value type is an unsafe {{value}} escape hatch. Replace it with a concrete owner/schema-derived value type and parse external data at its boundary.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    let environment: TypeEnvironment | null = null;
    const report = (node: ESTree.Node, value: string) =>
      context.report(Diagnostic.fromId({ node, messageId: "unsafeDictionary", data: { value } }));
    const reportIfUnsafe = (node: ESTree.TSType) => {
      if (environment === null || !shouldReportType(node, environment)) return Effect.void;
      const unsafe = classifyUnsafeDictionary(node, environment);
      return unsafe === null ? Effect.void : report(node, unsafe.unsafeValue);
    };
    return {
      Program: (node: ESTree.Program) => {
        environment = createTypeEnvironment(node, context.sourceCode.visitorKeys);
        return Effect.void;
      },
      TSTypeReference: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSMappedType: reportIfUnsafe,
      TSIndexSignature: (node: ESTree.TSIndexSignature) => {
        if (
          environment === null ||
          node.typeAnnotation === null ||
          node.parent?.type === "TSTypeLiteral"
        ) {
          return Effect.void;
        }
        const unsafe = classifyUnsafeDictionaryValue(
          node.typeAnnotation.typeAnnotation,
          environment,
        );
        return unsafe === null ? Effect.void : report(node, unsafe.unsafeValue);
      },
    };
  },
});
