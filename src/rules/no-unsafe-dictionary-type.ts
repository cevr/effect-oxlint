/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import type { ESTree } from "@oxlint/plugins";
import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  createTypeEnvironment,
  type TypeEnvironment,
} from "./_anti-slop-dictionary-types.js";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

function isTypeNode(node: ESTree.Node): node is ESTree.TSType {
  return node.type.startsWith("TS") && node.type !== "TSTypeAnnotation";
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
  return name !== null && environment.aliases.has(name) && !isInsideTypeAliasDeclaration(node);
}

function shouldReportType(node: ESTree.TSType, environment: TypeEnvironment): boolean {
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
        environment = createTypeEnvironment(node);
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
