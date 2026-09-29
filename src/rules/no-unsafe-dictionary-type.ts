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
  type UnsafeDictionary,
} from "./_anti-slop-dictionary-types.js";
import { visibleTypeAlias } from "./_anti-slop-type-alias-resolution.js";
import { ancestors } from "./_ast-ancestors.js";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

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

// Local change: returns Option instead of null.
function typeReferenceName(type: ESTree.TSTypeReference): Option.Option<string> {
  if (type.typeName.type !== "Identifier") return Option.none();
  return Option.some(type.typeName.name);
}

// Local change: searches ancestors() instead of a nullable parent loop.
function isInsideTypeAliasDeclaration(node: ESTree.Node): boolean {
  return Option.isSome(
    Arr.findFirst(ancestors(node), (ancestor) => ancestor.type === "TSTypeAliasDeclaration"),
  );
}

// Local change: reads the Option-returning name and alias lookups.
function isPlainAliasConsumerUse(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (node.type !== "TSTypeReference" || node.typeArguments?.params.length) return false;
  return (
    Option.exists(typeReferenceName(node), (name) =>
      Option.isSome(visibleTypeAlias(name, node, environment.typeAliases)),
    ) && !isInsideTypeAliasDeclaration(node)
  );
}

// Local change: walks ancestors() instead of a nullable parent loop.
function isInsideTypeParameterConstraint(node: ESTree.TSType): boolean {
  let child: ESTree.Node = node;
  for (const parent of ancestors(node)) {
    if (parent.type === "TSTypeParameter" && parent.constraint === child) return true;
    child = parent;
  }
  return false;
}

// Local change: searches ancestors() for an unsafe enclosing type instead of a parent loop.
function shouldReportType(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (isInsideTypeParameterConstraint(node)) return false;
  if (isPlainAliasConsumerUse(node, environment)) return false;
  if (Option.isNone(classifyUnsafeDictionary(node, environment))) return false;
  const unsafeAncestor = Arr.findFirst(
    ancestors(node),
    (ancestor) =>
      isTypeNode(ancestor) && Option.isSome(classifyUnsafeDictionary(ancestor, environment)),
  );
  return Option.isNone(unsafeAncestor);
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
    // Local change: the environment is an Option until Program sets it.
    let environment: Option.Option<TypeEnvironment> = Option.none();
    const report = (node: ESTree.Node, value: string) =>
      context.report(Diagnostic.fromId({ node, messageId: "unsafeDictionary", data: { value } }));
    const reportUnsafe = (node: ESTree.Node, unsafe: Option.Option<UnsafeDictionary>) =>
      Option.match(unsafe, {
        onNone: () => Effect.void,
        onSome: (found) => report(node, found.unsafeValue),
      });
    const reportIfUnsafe = (node: ESTree.TSType) => {
      if (Option.isNone(environment) || !shouldReportType(node, environment.value)) {
        return Effect.void;
      }
      return reportUnsafe(node, classifyUnsafeDictionary(node, environment.value));
    };
    return {
      Program: (node: ESTree.Program) => {
        environment = Option.some(createTypeEnvironment(node, context.sourceCode.visitorKeys));
        return Effect.void;
      },
      TSTypeReference: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSMappedType: reportIfUnsafe,
      TSIndexSignature: (node: ESTree.TSIndexSignature) => {
        if (
          Option.isNone(environment) ||
          Predicate.isNull(node.typeAnnotation) ||
          node.parent?.type === "TSTypeLiteral"
        ) {
          return Effect.void;
        }
        return reportUnsafe(
          node,
          classifyUnsafeDictionaryValue(node.typeAnnotation.typeAnnotation, environment.value),
        );
      },
    };
  },
});
