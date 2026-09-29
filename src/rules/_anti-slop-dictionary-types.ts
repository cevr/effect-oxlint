/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import {
  createTypeAliasEnvironment,
  hasVisibleTypeBinding,
  visibleTypeAlias,
  type TypeAliasEnvironment as LexicalTypeAliasEnvironment,
} from "./_anti-slop-type-alias-resolution.js";

const BUILT_INS = new Set([
  "Record",
  "Readonly",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "PropertyKey",
  "NonNullable",
]);
const TRANSPARENT_WRAPPERS = new Set(["Readonly", "Partial", "Required", "NonNullable"]);

type TypeAliasEnvironment = ReadonlyMap<string, ESTree.TSType>;

type ResolvedType = {
  readonly type: ESTree.TSType;
  readonly substitutions: TypeAliasEnvironment;
};

type AliasExpansion = ResolvedType & {
  readonly resolvingAliases: ReadonlySet<string>;
};

export type UnsafeDictionary = {
  readonly kind: "unsafe-dictionary";
  readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown";
};

export type WideningTargetKind =
  | "anonymous object"
  | "generic container"
  | "object"
  | "open dictionary"
  | "unknown";

export type WideningTarget = {
  readonly kind: WideningTargetKind;
};

export type TypeEnvironment = {
  readonly interfaces: ReadonlyMap<string, readonly ESTree.TSInterfaceDeclaration[]>;
  readonly typeAliases: LexicalTypeAliasEnvironment;
};

// Local change: returns Option instead of null.
function declaredStatement(statement: ESTree.Statement): Option.Option<ESTree.Node> {
  if (
    statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration"
  ) {
    return Option.fromNullishOr(statement.declaration);
  }
  return Option.some(statement);
}

function isInterfaceDeclaration(node: ESTree.Node): node is ESTree.TSInterfaceDeclaration {
  return node.type === "TSInterfaceDeclaration";
}

// Local change: interface declarations are selected from the Option-returning declaredStatement.
export function createTypeEnvironment(
  program: ESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
): TypeEnvironment {
  const interfaces = new Map<string, ESTree.TSInterfaceDeclaration[]>();
  const declared = Arr.getSomes(program.body.map(declaredStatement));

  for (const declaration of declared.filter(isInterfaceDeclaration)) {
    const declarations = interfaces.get(declaration.id.name) ?? [];
    declarations.push(declaration);
    interfaces.set(declaration.id.name, declarations);
  }

  return {
    interfaces,
    typeAliases: createTypeAliasEnvironment(program, visitorKeys),
  };
}

// Local change: returns Option instead of null.
function typeReferenceName(type: ESTree.TSTypeReference): Option.Option<string> {
  if (type.typeName.type !== "Identifier") return Option.none();
  return Option.some(type.typeName.name);
}

// Local change: reads a type argument as an Option instead of an optional-chained index.
function typeArgument(type: ESTree.TSTypeReference, index: number): Option.Option<ESTree.TSType> {
  return Arr.get(type.typeArguments?.params ?? [], index);
}

function isBuiltIn(name: string, use: ESTree.Node, environment: TypeEnvironment): boolean {
  return BUILT_INS.has(name) && !hasVisibleTypeBinding(name, use, environment.typeAliases);
}

function isUnappliedReferenceTo(type: ESTree.TSType, name: string): boolean {
  const unwrapped = unwrapTransparentType(type);
  return (
    unwrapped.type === "TSTypeReference" &&
    Option.contains(typeReferenceName(unwrapped), name) &&
    (unwrapped.typeArguments?.params.length ?? 0) === 0
  );
}

function unwrapTransparentType(type: ESTree.TSType): ESTree.TSType {
  let current = type;
  while (
    current.type === "TSParenthesizedType" ||
    (current.type === "TSTypeOperator" && current.operator === "readonly")
  ) {
    current = current.typeAnnotation;
  }
  return current;
}

function isNeverType(type: ESTree.TSType): boolean {
  return unwrapTransparentType(type).type === "TSNeverKeyword";
}

function isEffectivelyEmptyMember(member: ESTree.TSSignature): boolean {
  return (
    member.type === "TSPropertySignature" &&
    member.optional === true &&
    Predicate.isNotNullish(member.typeAnnotation) &&
    isNeverType(member.typeAnnotation.typeAnnotation)
  );
}

function isEffectivelyEmptyTypeLiteral(type: ESTree.TSTypeLiteral): boolean {
  return type.members.length === 0 || type.members.every(isEffectivelyEmptyMember);
}

function isEffectivelyEmptyInterface(
  declarations: readonly ESTree.TSInterfaceDeclaration[],
): boolean {
  if (declarations.length !== 1) return false;
  return Option.exists(
    Arr.head(declarations),
    (type) =>
      type.extends.length === 0 &&
      (type.body.body.length === 0 || type.body.body.every(isEffectivelyEmptyMember)),
  );
}

function resolvedSubstitutionArgument(
  type: ESTree.TSType,
  base: TypeAliasEnvironment,
  resolving: ReadonlySet<string> = new Set(),
): ESTree.TSType {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type !== "TSTypeReference") return type;
  const referenceName = typeReferenceName(unwrapped);
  if (Option.isNone(referenceName) || resolving.has(referenceName.value)) return type;
  const name = referenceName.value;
  const substitution = base.get(name);
  if (Predicate.isUndefined(substitution)) return type;
  const nextResolving = new Set(resolving);
  nextResolving.add(name);
  return resolvedSubstitutionArgument(substitution, base, nextResolving);
}

// Local change: returns Option instead of null.
function aliasSubstitution(
  alias: ESTree.TSTypeAliasDeclaration,
  type: ESTree.TSTypeReference,
  base: TypeAliasEnvironment,
): Option.Option<TypeAliasEnvironment> {
  const parameters = alias.typeParameters?.params ?? [];
  const next = new Map(base);
  for (const [index, parameter] of parameters.entries()) {
    const argument = Option.orElse(typeArgument(type, index), () =>
      Option.fromNullishOr(parameter.default),
    );
    if (Option.isNone(argument)) return Option.none();
    next.set(parameter.name.name, resolvedSubstitutionArgument(argument.value, next));
  }
  return Option.some(next);
}

/**
 * The visible alias named by a reference, expanded with its substitutions, unless it is
 * already resolving. (Local change: upstream repeats this step in each reference resolver.)
 */
function aliasExpansion(
  name: string,
  reference: ESTree.TSTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): Option.Option<AliasExpansion> {
  const alias = visibleTypeAlias(name, reference, environment.typeAliases);
  if (Option.isNone(alias) || resolvingAliases.has(name)) return Option.none();
  return Option.map(aliasSubstitution(alias.value, reference, substitutions), (next) => {
    const nextResolving = new Set(resolvingAliases);
    nextResolving.add(name);
    return {
      type: alias.value.typeAnnotation,
      substitutions: next,
      resolvingAliases: nextResolving,
    };
  });
}

// Local change: returns Option instead of null.
function unsafeDirectValue(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): Option.Option<UnsafeDictionary["unsafeValue"]> {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === "TSUnknownKeyword") return Option.some("unknown");
  if (unwrapped.type === "TSAnyKeyword") return Option.some("any");
  if (unwrapped.type === "TSObjectKeyword") return Option.some("object");
  if (unwrapped.type === "TSTypeLiteral" && isEffectivelyEmptyTypeLiteral(unwrapped))
    return Option.some("empty-object");
  if (unwrapped.type === "TSUnionType") {
    const hasUnsafeMember = unwrapped.types.some((member) =>
      Option.isSome(unsafeDirectValue(member, environment, substitutions, resolvingAliases)),
    );
    if (hasUnsafeMember) return Option.some("union");
    return Option.none();
  }
  if (unwrapped.type === "TSIntersectionType") {
    const unsafeMembers = unwrapped.types.map((member) =>
      unsafeDirectValue(member, environment, substitutions, resolvingAliases),
    );
    if (Arr.getSomes(unsafeMembers).includes("any")) return Option.some("any");
    return Option.flatMap(Option.all(unsafeMembers), Arr.head);
  }
  // Local change: type references resolve in unsafeReferenceValue to keep this function small.
  if (unwrapped.type !== "TSTypeReference") return Option.none();
  return unsafeReferenceValue(unwrapped, environment, substitutions, resolvingAliases);
}

// Local change: returns Option instead of null; aliases expand through aliasExpansion.
function unsafeReferenceValue(
  unwrapped: ESTree.TSTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): Option.Option<UnsafeDictionary["unsafeValue"]> {
  const referenceName = typeReferenceName(unwrapped);
  if (Option.isNone(referenceName)) return Option.none();
  const name = referenceName.value;
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    return Option.flatMap(typeArgument(unwrapped, 0), (wrapped) =>
      unsafeDirectValue(wrapped, environment, substitutions, resolvingAliases),
    );
  }
  const substitution = substitutions.get(name);
  if (Predicate.isNotUndefined(substitution)) {
    if (isUnappliedReferenceTo(substitution, name)) return Option.none();
    return unsafeDirectValue(substitution, environment, substitutions, resolvingAliases);
  }
  const interfaceDeclarations = environment.interfaces.get(name);
  if (Predicate.isNotUndefined(interfaceDeclarations)) {
    if (isEffectivelyEmptyInterface(interfaceDeclarations)) return Option.some("empty-object");
    return Option.none();
  }
  return Option.flatMap(
    aliasExpansion(name, unwrapped, environment, substitutions, resolvingAliases),
    (expansion) =>
      unsafeDirectValue(
        expansion.type,
        environment,
        expansion.substitutions,
        expansion.resolvingAliases,
      ),
  );
}

// Local change: nullable annotations are guarded with Predicate instead of ternaries.
function dictionaryValueTypes(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): readonly ResolvedType[] {
  const unwrapped = unwrapTransparentType(type);

  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.flatMap((member): readonly ResolvedType[] => {
      if (member.type !== "TSIndexSignature" || Predicate.isNull(member.typeAnnotation)) return [];
      return [{ type: member.typeAnnotation.typeAnnotation, substitutions }];
    });
  }

  if (unwrapped.type === "TSMappedType") {
    if (Predicate.isNull(unwrapped.typeAnnotation)) return [];
    return [{ type: unwrapped.typeAnnotation, substitutions }];
  }

  // Local change: type references resolve in referenceValueTypes to keep this function small.
  if (unwrapped.type !== "TSTypeReference") return [];
  return referenceValueTypes(unwrapped, environment, substitutions, resolvingAliases);
}

// Local change: reads Option-returning helpers; aliases expand through aliasExpansion.
function referenceValueTypes(
  unwrapped: ESTree.TSTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): readonly ResolvedType[] {
  const referenceName = typeReferenceName(unwrapped);
  if (Option.isNone(referenceName)) return [];
  const name = referenceName.value;

  const substitution = substitutions.get(name);
  if (Predicate.isNotUndefined(substitution)) {
    if (isUnappliedReferenceTo(substitution, name)) return [];
    return dictionaryValueTypes(substitution, environment, substitutions, resolvingAliases);
  }

  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    return Option.match(typeArgument(unwrapped, 0), {
      onNone: () => [],
      onSome: (wrapped) =>
        dictionaryValueTypes(wrapped, environment, substitutions, resolvingAliases),
    });
  }

  if (name === "Record" && isBuiltIn(name, unwrapped, environment)) {
    return Option.toArray(
      Option.map(typeArgument(unwrapped, 1), (value) => ({ type: value, substitutions })),
    );
  }

  if ((name === "Pick" || name === "Omit") && isBuiltIn(name, unwrapped, environment)) {
    return Option.match(typeArgument(unwrapped, 0), {
      onNone: () => [],
      onSome: (source) =>
        dictionaryValueTypes(source, environment, substitutions, resolvingAliases),
    });
  }

  return Option.match(
    aliasExpansion(name, unwrapped, environment, substitutions, resolvingAliases),
    {
      onNone: () => [],
      onSome: (expansion) =>
        dictionaryValueTypes(
          expansion.type,
          environment,
          expansion.substitutions,
          expansion.resolvingAliases,
        ),
    },
  );
}

const unsafeDictionary = (unsafeValue: UnsafeDictionary["unsafeValue"]): UnsafeDictionary => ({
  kind: "unsafe-dictionary",
  unsafeValue,
});

// Local change: returns Option instead of null.
export function classifyUnsafeDictionaryValue(
  valueType: ESTree.TSType,
  environment: TypeEnvironment,
): Option.Option<UnsafeDictionary> {
  return Option.map(
    unsafeDirectValue(valueType, environment, new Map(), new Set()),
    unsafeDictionary,
  );
}

// Local change: returns Option instead of null.
export function classifyUnsafeDictionary(
  type: ESTree.TSType,
  environment: TypeEnvironment,
): Option.Option<UnsafeDictionary> {
  return Arr.findFirst(dictionaryValueTypes(type, environment, new Map(), new Set()), (valueType) =>
    Option.map(
      unsafeDirectValue(valueType.type, environment, valueType.substitutions, new Set()),
      unsafeDictionary,
    ),
  );
}

// Local change: returns Option instead of null, with ternaries as early returns.
export function classifyWideningTarget(
  type: ESTree.TSType,
  environment: TypeEnvironment,
): Option.Option<WideningTarget> {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === "TSUnknownKeyword") return Option.some({ kind: "unknown" });
  if (unwrapped.type === "TSObjectKeyword") return Option.some({ kind: "object" });
  if (unwrapped.type === "TSTypeLiteral") {
    if (unwrapped.members.some((member) => member.type === "TSIndexSignature")) {
      return Option.some({ kind: "open dictionary" });
    }
    if (unwrapped.members.length > 0) return Option.some({ kind: "anonymous object" });
    return Option.none();
  }
  if (unwrapped.type === "TSMappedType") return Option.some({ kind: "open dictionary" });
  if (unwrapped.type !== "TSTypeReference") return Option.none();
  const referenceName = typeReferenceName(unwrapped);
  if (Option.isNone(referenceName)) return Option.none();
  const name = referenceName.value;
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    return Option.flatMap(typeArgument(unwrapped, 0), (wrapped) =>
      classifyWideningTarget(wrapped, environment),
    );
  }
  if (name === "Record" && isBuiltIn(name, unwrapped, environment)) {
    if (hasBroadRecordKey(unwrapped, environment, new Map())) {
      return Option.some({ kind: "open dictionary" });
    }
    return Option.none();
  }
  // Local change: alias targets classify in classifyWideningAlias to keep this function small.
  return Option.flatMap(visibleTypeAlias(name, unwrapped, environment.typeAliases), (alias) =>
    classifyWideningAlias(alias, unwrapped, name, environment),
  );
}

// Local change: returns Option instead of null; both branches share one alias resolution.
function classifyWideningAlias(
  alias: ESTree.TSTypeAliasDeclaration,
  unwrapped: ESTree.TSTypeReference,
  name: string,
  environment: TypeEnvironment,
): Option.Option<WideningTarget> {
  const resolved = Option.flatMap(aliasSubstitution(alias, unwrapped, new Map()), (substitutions) =>
    classifyAliasBroadTarget(alias.typeAnnotation, environment, substitutions, new Set([name])),
  );
  if ((alias.typeParameters?.params.length ?? 0) === 0) return resolved;
  if (Option.exists(resolved, (target) => target.kind === "open dictionary")) {
    return Option.some({ kind: "generic container" });
  }
  return Option.none();
}

// Local change: the key argument is an Option instead of undefined.
function hasBroadRecordKey(
  type: ESTree.TSTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
): boolean {
  return Option.match(typeArgument(type, 0), {
    onNone: () => true,
    onSome: (key) => isBroadMappedKey(key, environment, substitutions),
  });
}

// Local change: reads Option-returning helpers instead of null checks.
function isBroadMappedKey(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  visitedAliases: ReadonlySet<string> = new Set(),
): boolean {
  const unwrapped = unwrapTransparentType(type);
  if (
    unwrapped.type === "TSStringKeyword" ||
    unwrapped.type === "TSNumberKeyword" ||
    unwrapped.type === "TSSymbolKeyword"
  ) {
    return true;
  }
  if (unwrapped.type === "TSUnionType") {
    return unwrapped.types.some((member) =>
      isBroadMappedKey(member, environment, substitutions, visitedAliases),
    );
  }
  if (unwrapped.type !== "TSTypeReference") return false;
  const referenceName = typeReferenceName(unwrapped);
  if (Option.isNone(referenceName)) return false;
  const name = referenceName.value;
  const substitution = substitutions.get(name);
  if (Predicate.isNotUndefined(substitution) && !isUnappliedReferenceTo(substitution, name)) {
    return isBroadMappedKey(substitution, environment, substitutions, visitedAliases);
  }
  if (name === "PropertyKey" && isBuiltIn(name, unwrapped, environment)) return true;
  const alias = visibleTypeAlias(name, unwrapped, environment.typeAliases);
  if (
    Option.isNone(alias) ||
    (alias.value.typeParameters?.params.length ?? 0) > 0 ||
    visitedAliases.has(name)
  ) {
    return false;
  }
  const nextVisited = new Set(visitedAliases);
  nextVisited.add(name);
  return isBroadMappedKey(alias.value.typeAnnotation, environment, substitutions, nextVisited);
}

// Local change: returns Option instead of null, with ternaries as early returns.
function classifyAliasBroadTarget(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): Option.Option<WideningTarget> {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === "TSUnknownKeyword") return Option.some({ kind: "unknown" });
  if (unwrapped.type === "TSObjectKeyword") return Option.some({ kind: "object" });
  if (unwrapped.type === "TSTypeLiteral") {
    if (unwrapped.members.some((member) => member.type === "TSIndexSignature")) {
      return Option.some({ kind: "open dictionary" });
    }
    return Option.none();
  }
  if (unwrapped.type === "TSMappedType") {
    if (isBroadMappedKey(unwrapped.constraint, environment, substitutions)) {
      return Option.some({ kind: "open dictionary" });
    }
    return Option.none();
  }
  // Local change: type references classify in classifyReferenceBroadTarget to keep this function small.
  if (unwrapped.type !== "TSTypeReference") return Option.none();
  return classifyReferenceBroadTarget(unwrapped, environment, substitutions, resolvingAliases);
}

// Local change: returns Option instead of null; aliases expand through aliasExpansion.
function classifyReferenceBroadTarget(
  unwrapped: ESTree.TSTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>,
): Option.Option<WideningTarget> {
  const referenceName = typeReferenceName(unwrapped);
  if (Option.isNone(referenceName)) return Option.none();
  const name = referenceName.value;
  const substitution = substitutions.get(name);
  if (Predicate.isNotUndefined(substitution)) {
    if (isUnappliedReferenceTo(substitution, name)) return Option.none();
    return classifyAliasBroadTarget(substitution, environment, substitutions, resolvingAliases);
  }
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    return Option.flatMap(typeArgument(unwrapped, 0), (wrapped) =>
      classifyAliasBroadTarget(wrapped, environment, substitutions, resolvingAliases),
    );
  }
  if (name === "Record" && isBuiltIn(name, unwrapped, environment)) {
    if (hasBroadRecordKey(unwrapped, environment, substitutions)) {
      return Option.some({ kind: "open dictionary" });
    }
    return Option.none();
  }
  return Option.flatMap(
    aliasExpansion(name, unwrapped, environment, substitutions, resolvingAliases),
    (expansion) =>
      classifyAliasBroadTarget(
        expansion.type,
        environment,
        expansion.substitutions,
        expansion.resolvingAliases,
      ),
  );
}

export function isPopulatedObjectExpression(expression: ESTree.Expression): boolean {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression"
  ) {
    current = current.expression;
  }
  return current.type === "ObjectExpression" && current.properties.length > 0;
}

export function isKnownEvidenceExpression(expression: ESTree.Expression): boolean {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSSatisfiesExpression"
  ) {
    current = current.expression;
  }
  if (current.type === "ObjectExpression") return true;
  return (
    current.type === "ArrayExpression" ||
    current.type === "ArrowFunctionExpression" ||
    current.type === "ClassExpression" ||
    current.type === "FunctionExpression" ||
    current.type === "NewExpression" ||
    current.type === "Literal" ||
    current.type === "TemplateLiteral" ||
    current.type === "UnaryExpression"
  );
}
