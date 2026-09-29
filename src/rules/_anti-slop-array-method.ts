/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

/** Unwrap syntax-only wrappers when inspecting array methods and accumulator references. */
export function unwrapArrayExpression(node: ESTree.Node): ESTree.Node {
  while (
    node.type === "ParenthesizedExpression" ||
    node.type === "ChainExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression"
  ) {
    node = node.expression;
  }
  return node;
}

// Local change: the scope walk is a generator so the lookup reads as a search.
function* scopeChain(scope: Scope): Iterable<Scope> {
  let current = Option.some(scope);
  while (Option.isSome(current)) {
    yield current.value;
    current = Option.fromNullOr(current.value.upper);
  }
}

// Local change: returns Option instead of null.
/** Resolve a local binding by scope, not by identifier spelling. */
export function resolveArrayBinding(
  sourceCode: SourceCode,
  node: ESTree.Node,
): Option.Option<Variable> {
  node = unwrapArrayExpression(node);
  if (node.type !== "Identifier") return Option.none();
  const name = node.name;
  return Arr.findFirst(scopeChain(sourceCode.getScope(node)), (scope) =>
    Option.fromUndefinedOr(scope.set.get(name)),
  );
}

// Local change: returns Option instead of null.
/** Read static method names, including computed string literals, without evaluating expressions. */
export function arrayMethodTarget(
  node: ESTree.Node,
): Option.Option<{ readonly name: string; readonly object: ESTree.Node }> {
  node = unwrapArrayExpression(node);
  if (node.type !== "MemberExpression") return Option.none();
  const property = node.property;
  if (!node.computed && property.type === "Identifier") {
    return Option.some({ name: property.name, object: node.object });
  }
  // Local change: Predicate.isString replaces a runtime typeof check.
  if (node.computed && property.type === "Literal" && Predicate.isString(property.value)) {
    return Option.some({ name: property.value, object: node.object });
  }
  return Option.none();
}

function isArrayAnnotation(type: ESTree.TSType): boolean {
  if (type.type === "TSArrayType" || type.type === "TSTupleType") return true;
  if (type.type === "TSParenthesizedType") return isArrayAnnotation(type.typeAnnotation);
  if (type.type === "TSTypeOperator" && type.operator === "readonly") {
    return isArrayAnnotation(type.typeAnnotation);
  }
  return (
    type.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    (type.typeName.name === "Array" || type.typeName.name === "ReadonlyArray")
  );
}

// Local change: method and binding lookups compose Option instead of null checks.
/** Recognize local array evidence; unknown receivers and iterator pipelines are deliberately excluded. */
export function isKnownArrayExpression(
  sourceCode: SourceCode,
  node: ESTree.Node,
  visited = new Set<Variable>(),
): boolean {
  node = unwrapArrayExpression(node);
  if (node.type === "ArrayExpression") return true;
  if (node.type === "CallExpression") {
    return Option.exists(
      arrayMethodTarget(node.callee),
      (method) =>
        [
          "map",
          "filter",
          "flatMap",
          "slice",
          "concat",
          "toSorted",
          "toReversed",
          "toSpliced",
        ].includes(method.name) && isKnownArrayExpression(sourceCode, method.object, visited),
    );
  }
  if (node.type !== "Identifier") return false;
  return Option.exists(resolveArrayBinding(sourceCode, node), (variable) =>
    isKnownArrayVariable(sourceCode, variable, visited),
  );
}

// Local change: the binding half of isKnownArrayExpression, split out for the Option lookup.
function isKnownArrayVariable(
  sourceCode: SourceCode,
  variable: Variable,
  visited: Set<Variable>,
): boolean {
  if (visited.has(variable)) return false;
  visited.add(variable);
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) return false;
  for (const identifier of variable.identifiers) {
    const annotation = identifier.typeAnnotation?.typeAnnotation;
    if (Predicate.isNotUndefined(annotation)) return isArrayAnnotation(annotation);
  }
  return Option.exists(constInitializer(variable), (init) =>
    isKnownArrayExpression(sourceCode, init, visited),
  );
}

// Local change: the const-initializer lookup is shared with no-reduce-accumulator-copy.
/** The initializer of the first `const name = init` definition of a variable. */
export function constInitializer(variable: Variable): Option.Option<ESTree.Expression> {
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" &&
      definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" &&
      Predicate.isNotNull(definition.node.init) &&
      definition.node.parent.type === "VariableDeclaration" &&
      definition.node.parent.kind === "const"
    ) {
      return Option.some(definition.node.init);
    }
  }
  return Option.none();
}
