/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ESTree, Scope, Variable } from "@oxlint/plugins";

import { ancestors } from "./_ast-ancestors.js";

type BroadTypeKind = "top" | "object" | "record";

// Local change: absent evidence types are Option instead of null.
type KnownValueEvidence = {
  readonly type: Option.Option<ESTree.TSType>;
};

type WidenedBinding = {
  readonly broadKind: BroadTypeKind;
  readonly evidence: KnownValueEvidence;
  readonly declaredAt: number;
  readonly boundary: Option.Option<ESTree.Node>;
};

const functionBoundaryTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
]);

// Local change: function boundaries are Options, compared by node identity.
const sameBoundary = Option.makeEquivalence<ESTree.Node>((left, right) => left === right);

function unwrapExpressionParentheses(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (current.type === "ParenthesizedExpression") current = current.expression;
  return current;
}

function unwrapTypeParentheses(type: ESTree.TSType): ESTree.TSType {
  let current = type;
  while (current.type === "TSParenthesizedType") current = current.typeAnnotation;
  return current;
}

// Local change: returns Option instead of null.
function typeReferenceName(type: ESTree.TSTypeReference): Option.Option<string> {
  if (type.typeName.type !== "Identifier") return Option.none();
  return Option.some(type.typeName.name);
}

function isReferenceNamed(type: ESTree.TSTypeReference, name: string): boolean {
  return Option.contains(typeReferenceName(type), name);
}

/** The two type arguments of a reference such as `Record<K, V>`, when it has exactly two. */
function typeArgumentPair(
  reference: ESTree.TSTypeReference,
): Option.Option<readonly [ESTree.TSType, ESTree.TSType]> {
  const parameters = reference.typeArguments?.params ?? [];
  if (parameters.length !== 2) return Option.none();
  return Option.all([Arr.get(parameters, 0), Arr.get(parameters, 1)]);
}

function firstTypeArgument(reference: ESTree.TSTypeReference): Option.Option<ESTree.TSType> {
  return Arr.head(reference.typeArguments?.params ?? []);
}

function isUnknownOrAnyType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  return unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword";
}

function isBroadRecordKeyType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  if (
    unwrapped.type === "TSStringKeyword" ||
    unwrapped.type === "TSNumberKeyword" ||
    unwrapped.type === "TSSymbolKeyword"
  ) {
    return true;
  }
  if (unwrapped.type === "TSUnionType") return unwrapped.types.every(isBroadRecordKeyType);
  return unwrapped.type === "TSTypeReference" && isReferenceNamed(unwrapped, "PropertyKey");
}

// Local change: type arguments are read as Options instead of checked against undefined.
function isBroadRecordReference(reference: ESTree.TSTypeReference): boolean {
  if (isReferenceNamed(reference, "Readonly")) {
    return Option.exists(firstTypeArgument(reference), isBroadRecordType);
  }

  if (!isReferenceNamed(reference, "Record")) return false;
  return Option.exists(
    typeArgumentPair(reference),
    ([key, value]) => isBroadRecordKeyType(key) && isUnknownOrAnyType(value),
  );
}

// Local change: the lone index-signature check reads its parameter as an Option.
function isBroadIndexSignature(member: ESTree.TSIndexSignature): boolean {
  return (
    member.parameters.length === 1 &&
    Option.exists(Arr.head(member.parameters), (parameter) =>
      isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation),
    ) &&
    isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
  );
}

function isBroadRecordType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);

  // Local change: Record references are checked in isBroadRecordReference to keep this function small.
  if (unwrapped.type === "TSTypeReference") return isBroadRecordReference(unwrapped);

  if (unwrapped.type !== "TSTypeLiteral" || unwrapped.members.length !== 1) return false;
  return Option.exists(
    Arr.head(unwrapped.members),
    (member) => member.type === "TSIndexSignature" && isBroadIndexSignature(member),
  );
}

// Local change: returns Option instead of null.
function broadTypeKind(type: ESTree.TSType): Option.Option<BroadTypeKind> {
  const unwrapped = unwrapTypeParentheses(type);
  if (unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword") {
    return Option.some("top");
  }
  if (unwrapped.type === "TSObjectKeyword") return Option.some("object");
  if (isBroadRecordType(unwrapped)) return Option.some("record");
  return Option.none();
}

function isBroadType(type: ESTree.TSType): boolean {
  return Option.isSome(broadTypeKind(type));
}

function assertedExpression(
  node: ESTree.TSAsExpression | ESTree.TSTypeAssertion,
): ESTree.Expression {
  return unwrapExpressionParentheses(node.expression);
}

// Local change: returns Option instead of null.
function assertionFromExpression(
  expression: ESTree.Expression,
): Option.Option<ESTree.TSAsExpression | ESTree.TSTypeAssertion> {
  const unwrapped = unwrapExpressionParentheses(expression);
  if (unwrapped.type === "TSAsExpression" || unwrapped.type === "TSTypeAssertion") {
    return Option.some(unwrapped);
  }
  return Option.none();
}

function normalizedTypeText(sourceText: string, type: ESTree.TSType): string {
  return sourceText.slice(type.start, type.end).replaceAll(/\s+/gu, "");
}

function typesHaveSameSyntax(
  sourceText: string,
  left: Option.Option<ESTree.TSType>,
  right: ESTree.TSType,
): boolean {
  return Option.exists(
    left,
    (type) =>
      normalizedTypeText(sourceText, unwrapTypeParentheses(type)) ===
      normalizedTypeText(sourceText, unwrapTypeParentheses(right)),
  );
}

function isDefinitelyObjectType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  switch (unwrapped.type) {
    case "TSArrayType":
    case "TSConstructorType":
    case "TSFunctionType":
    case "TSMappedType":
    case "TSObjectKeyword":
    case "TSTupleType":
      return true;
    case "TSTypeLiteral":
      return unwrapped.members.length > 0;
    case "TSIntersectionType":
      return unwrapped.types.every(isDefinitelyObjectType);
    case "TSTypeOperator":
      return unwrapped.operator === "readonly" && isDefinitelyObjectType(unwrapped.typeAnnotation);
    default:
      return false;
  }
}

function isDefinitelyNarrowerRecordType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.some((member) => member.type !== "TSIndexSignature");
  }

  if (unwrapped.type !== "TSTypeReference") return false;
  if (isReferenceNamed(unwrapped, "Readonly")) {
    return Option.exists(firstTypeArgument(unwrapped), isDefinitelyNarrowerRecordType);
  }
  if (!isReferenceNamed(unwrapped, "Record")) return false;

  return Option.exists(typeArgumentPair(unwrapped), ([, value]) => !isUnknownOrAnyType(value));
}

// Local change: walks ancestors and returns Option instead of null.
function functionBoundary(node: ESTree.Node): Option.Option<ESTree.Node> {
  return Arr.findFirst(ancestors(node), (ancestor) => functionBoundaryTypes.has(ancestor.type));
}

// Local change: scopes use the host Scope type, and the result is Option instead of null.
function resolvedVariableForIdentifier(
  scopes: ReadonlyArray<Scope>,
  identifier: ESTree.IdentifierReference,
): Option.Option<Variable> {
  const reference = Arr.findFirst(scopes, (scope) =>
    Arr.findFirst(
      scope.references,
      (candidate) =>
        candidate.identifier.start === identifier.start &&
        candidate.identifier.end === identifier.end,
    ),
  );
  return Option.flatMap(reference, (found) => Option.fromNullishOr(found.resolved));
}

// Local change: returns Option instead of null.
function variableDeclarator(variable: Variable): Option.Option<ESTree.VariableDeclarator> {
  for (const definition of variable.defs) {
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
      return Option.some(definition.node);
    }
  }
  return Option.none();
}

function isConstDeclarator(declarator: ESTree.VariableDeclarator): boolean {
  return declarator.parent.type === "VariableDeclaration" && declarator.parent.kind === "const";
}

function isReassigned(variable: Variable): boolean {
  return variable.references.some((reference) => reference.isWrite() && !reference.init);
}

// Local change: returns Option instead of null.
function knownValueEvidence(
  expression: ESTree.Expression,
  scopes: ReadonlyArray<Scope>,
  boundary: Option.Option<ESTree.Node>,
  visitedVariables: ReadonlySet<Variable>,
): Option.Option<KnownValueEvidence> {
  const unwrapped = unwrapExpressionParentheses(expression);

  if (unwrapped.type === "TSAsExpression" || unwrapped.type === "TSTypeAssertion") {
    if (isBroadType(unwrapped.typeAnnotation)) return Option.none();
    return Option.some({ type: Option.some(unwrapped.typeAnnotation) });
  }

  if (unwrapped.type === "Literal" || unwrapped.type === "TemplateLiteral") {
    return Option.some({ type: Option.none() });
  }

  if (
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "NewExpression" ||
    unwrapped.type === "ObjectExpression"
  ) {
    return Option.some({ type: Option.none() });
  }

  // Local change: identifiers resolve in identifierValueEvidence to keep this function small.
  if (unwrapped.type === "Identifier") {
    return identifierValueEvidence(unwrapped, scopes, boundary, visitedVariables);
  }
  return Option.none();
}

// Local change: returns Option instead of null; annotated and declared bindings are split out.
function identifierValueEvidence(
  expression: ESTree.IdentifierReference,
  scopes: ReadonlyArray<Scope>,
  boundary: Option.Option<ESTree.Node>,
  visitedVariables: ReadonlySet<Variable>,
): Option.Option<KnownValueEvidence> {
  return resolvedVariableForIdentifier(scopes, expression).pipe(
    Option.filter((variable) => !visitedVariables.has(variable)),
    Option.flatMap((variable) =>
      Option.match(annotatedIdentifier(variable), {
        onSome: ([identifier, annotation]) =>
          annotatedValueEvidence(identifier, annotation, boundary),
        onNone: () => declaredValueEvidence(variable, scopes, boundary, visitedVariables),
      }),
    ),
  );
}

/** The first declaration identifier of a variable that carries a type annotation. */
function annotatedIdentifier(
  variable: Variable,
): Option.Option<readonly [ESTree.Node, ESTree.TSType]> {
  return Arr.findFirst(variable.identifiers, (identifier) =>
    Option.map(
      Option.fromNullishOr(identifier.typeAnnotation),
      (annotation) => [identifier, annotation.typeAnnotation] as const,
    ),
  );
}

function annotatedValueEvidence(
  identifier: ESTree.Node,
  annotation: ESTree.TSType,
  boundary: Option.Option<ESTree.Node>,
): Option.Option<KnownValueEvidence> {
  if (!sameBoundary(functionBoundary(identifier), boundary) || isBroadType(annotation)) {
    return Option.none();
  }
  return Option.some({ type: Option.some(annotation) });
}

function declaredValueEvidence(
  variable: Variable,
  scopes: ReadonlyArray<Scope>,
  boundary: Option.Option<ESTree.Node>,
  visitedVariables: ReadonlySet<Variable>,
): Option.Option<KnownValueEvidence> {
  return variableDeclarator(variable).pipe(
    Option.filter(
      (declarator) =>
        isConstDeclarator(declarator) &&
        !isReassigned(variable) &&
        sameBoundary(functionBoundary(declarator), boundary),
    ),
    Option.flatMap((declarator) => Option.fromNullishOr(declarator.init)),
    Option.flatMap((init) =>
      knownValueEvidence(init, scopes, boundary, new Set([...visitedVariables, variable])),
    ),
  );
}

// Local change: returns Option instead of null; the widening analysis lives in widenedDeclarator.
function widenedBinding(
  variable: Variable,
  scopes: ReadonlyArray<Scope>,
): Option.Option<WidenedBinding> {
  return variableDeclarator(variable).pipe(
    Option.filter(
      (declarator) =>
        isConstDeclarator(declarator) &&
        declarator.id.type === "Identifier" &&
        !isReassigned(variable),
    ),
    Option.flatMap((declarator) =>
      Option.flatMap(Option.fromNullishOr(declarator.init), (init) =>
        widenedDeclarator(variable, declarator, init, scopes),
      ),
    ),
  );
}

function widenedDeclarator(
  variable: Variable,
  declarator: ESTree.VariableDeclarator,
  init: ESTree.Expression,
  scopes: ReadonlyArray<Scope>,
): Option.Option<WidenedBinding> {
  const identifier = Arr.findFirst(
    variable.identifiers,
    (candidate) => candidate.start === declarator.id.start && candidate.end === declarator.id.end,
  );
  const boundary = functionBoundary(declarator);
  const declaredType = identifier.pipe(
    Option.flatMap((found) => Option.fromNullishOr(found.typeAnnotation)),
    Option.map((annotation) => annotation.typeAnnotation),
  );
  const initializerAssertion = assertionFromExpression(init);
  const initializerBroadKind = Option.flatMap(initializerAssertion, (assertion) =>
    broadTypeKind(assertion.typeAnnotation),
  );
  const declaredBroadKind = Option.flatMap(declaredType, broadTypeKind);
  const broadKind = Option.orElse(declaredBroadKind, () => initializerBroadKind);

  const originalExpression = Option.match(
    Option.zipLeft(initializerAssertion, initializerBroadKind),
    { onNone: () => init, onSome: assertedExpression },
  );
  return Option.flatMap(broadKind, (kind) =>
    Option.map(
      knownValueEvidence(originalExpression, scopes, boundary, new Set([variable])),
      (evidence) => ({ broadKind: kind, evidence, declaredAt: declarator.end, boundary }),
    ),
  );
}

function assertionIsNarrower(
  sourceText: string,
  broadKind: BroadTypeKind,
  evidence: KnownValueEvidence,
  assertedType: ESTree.TSType,
): boolean {
  if (isBroadType(assertedType)) return false;
  if (broadKind === "top") return true;
  if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) return true;
  if (broadKind === "object") return isDefinitelyObjectType(assertedType);
  return isDefinitelyNarrowerRecordType(assertedType);
}

/** Detect immutable local bindings that erase a known type and are later asserted back to a narrower type. */
export const noWidenThenAssert = Rule.define({
  name: "no-widen-then-assert",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type.",
    messages: {
      widenThenAssert:
        'Binding "{{name}}" erases established type evidence by widening the value, then reconstructs that evidence with a type assertion. Preserve the precise type end-to-end; if the input is genuinely unknown, parse it once at the boundary instead.',
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    const scopes = context.sourceCode.scopeManager.scopes;

    const checkAssertion = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
      const expression = assertedExpression(node);
      if (expression.type !== "Identifier") return Effect.void;
      const widened = Option.flatMap(
        resolvedVariableForIdentifier(scopes, expression),
        (variable) => widenedBinding(variable, scopes),
      );
      if (
        !Option.exists(
          widened,
          (binding) =>
            node.start > binding.declaredAt &&
            sameBoundary(functionBoundary(node), binding.boundary) &&
            assertionIsNarrower(
              context.sourceCode.text,
              binding.broadKind,
              binding.evidence,
              node.typeAnnotation,
            ),
        )
      ) {
        return Effect.void;
      }
      return context.report(
        Diagnostic.fromId({
          node,
          messageId: "widenThenAssert",
          data: { name: expression.name },
        }),
      );
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
