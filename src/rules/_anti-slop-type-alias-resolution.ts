/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import { ancestors } from "./_ast-ancestors.js";
import { childNodesAt, isAstNode } from "./_ast-children.js";

import { lexicalTypeParameterNames } from "./_anti-slop-lexical-type-parameters.js";

type VisitorKeys = Readonly<Record<string, readonly string[]>>;
type TypeScope = ESTree.Node;

type DeclaredTypeBinding = {
  readonly alias: Option.Option<ESTree.TSTypeAliasDeclaration>;
  readonly name: string;
};

type TypeBinding = DeclaredTypeBinding & {
  readonly scope: TypeScope;
};

type Substitution = {
  readonly substitutions: Substitutions;
  readonly type: ESTree.TSType;
};

type Substitutions = ReadonlyMap<string, Substitution>;

export type TypeAliasEnvironment = {
  readonly aliases: readonly ESTree.TSTypeAliasDeclaration[];
  readonly bindingsByName: ReadonlyMap<string, readonly TypeBinding[]>;
  readonly visitorKeys: VisitorKeys;
};

export type ResolvedTypeMatcher = (
  type: ESTree.TSType,
  matches: (child: ESTree.TSType) => boolean,
) => boolean;

const environmentsByProgram = new WeakMap<ESTree.Program, TypeAliasEnvironment>();

// Local change: the node test is the shared isAstNode instead of runtime typeof checks.
function isNode(value: unknown): value is ESTree.Node {
  return isAstNode(value);
}

function isTypeScope(node: ESTree.Node): boolean {
  return (
    node.type === "Program" ||
    node.type === "BlockStatement" ||
    node.type === "TSModuleBlock" ||
    node.type === "StaticBlock" ||
    node.type === "SwitchStatement"
  );
}

// Local change: finds the scope among ancestors() instead of a nullable parent loop.
function enclosingTypeScope(node: ESTree.Node): TypeScope {
  return Option.getOrElse(Arr.findFirst(ancestors(node), isTypeScope), () => node);
}

// Local change: returns Option instead of null, and the binding's alias is an Option.
function declaredTypeBinding(node: ESTree.Node): Option.Option<DeclaredTypeBinding> {
  if (node.type === "TSTypeAliasDeclaration") {
    return Option.some({ alias: Option.some(node), name: node.id.name });
  }
  if (
    node.type === "TSInterfaceDeclaration" ||
    node.type === "TSEnumDeclaration" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassExpression"
  ) {
    return Option.map(Option.fromNullishOr(node.id), (id) => ({
      alias: Option.none(),
      name: id.name,
    }));
  }
  if (
    node.type === "ImportSpecifier" ||
    node.type === "ImportDefaultSpecifier" ||
    node.type === "ImportNamespaceSpecifier"
  ) {
    return Option.some({ alias: Option.none(), name: node.local.name });
  }
  return Option.none();
}

function collectTypeBindings(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  bindingsByName: Map<string, TypeBinding[]>,
  aliases: ESTree.TSTypeAliasDeclaration[],
): void {
  const declared = declaredTypeBinding(node);
  if (Option.isSome(declared)) {
    const { alias, name } = declared.value;
    const bindings = bindingsByName.get(name) ?? [];
    bindings.push({ alias, name, scope: enclosingTypeScope(node) });
    bindingsByName.set(name, bindings);
    if (Option.isSome(alias)) aliases.push(alias.value);
  }

  // Local change: children are read through childNodesAt instead of a dictionary cast.
  for (const key of visitorKeys[node.type] ?? []) {
    for (const child of childNodesAt(node, key, isNode)) {
      collectTypeBindings(child, visitorKeys, bindingsByName, aliases);
    }
  }
}

/** Collect every lexical type alias and competing type binding in a program. */
export function createTypeAliasEnvironment(
  program: ESTree.Program,
  visitorKeys: VisitorKeys,
): TypeAliasEnvironment {
  const cached = environmentsByProgram.get(program);
  if (Predicate.isNotUndefined(cached)) return cached;
  const bindingsByName = new Map<string, TypeBinding[]>();
  const aliases: ESTree.TSTypeAliasDeclaration[] = [];
  collectTypeBindings(program, visitorKeys, bindingsByName, aliases);
  const environment = { aliases, bindingsByName, visitorKeys };
  environmentsByProgram.set(program, environment);
  return environment;
}

// Local change: returns Option instead of null, counting over the node and its ancestors().
function ancestorDistance(ancestor: ESTree.Node, node: ESTree.Node): Option.Option<number> {
  return Arr.findFirstIndex([node, ...ancestors(node)], (current) => current === ancestor);
}

function nearestTypeBindings(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment,
): readonly TypeBinding[] {
  const candidates = environment.bindingsByName.get(name) ?? [];
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearest: TypeBinding[] = [];
  for (const candidate of candidates) {
    const distance = ancestorDistance(candidate.scope, use);
    if (Option.isNone(distance) || distance.value > nearestDistance) continue;
    if (distance.value === nearestDistance) {
      nearest.push(candidate);
      continue;
    }
    nearestDistance = distance.value;
    nearest = [candidate];
  }
  return nearest;
}

/** Resolve the nearest visible alias with this name, respecting lexical shadowing. */
// Local change: returns Option instead of null.
export function visibleTypeAlias(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment,
): Option.Option<ESTree.TSTypeAliasDeclaration> {
  if (lexicalTypeParameterNames(use, environment.visitorKeys).has(name)) return Option.none();
  const bindings = nearestTypeBindings(name, use, environment);
  if (bindings.length !== 1) return Option.none();
  return Option.flatMap(Arr.head(bindings), (binding) => binding.alias);
}

/** Return whether a local declaration shadows a built-in type at this use. */
export function hasVisibleTypeBinding(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment,
): boolean {
  return (
    lexicalTypeParameterNames(use, environment.visitorKeys).has(name) ||
    nearestTypeBindings(name, use, environment).length > 0
  );
}

// Local change: returns Option instead of null.
function typeReferenceName(type: ESTree.TSTypeReference): Option.Option<string> {
  if (type.typeName.type !== "Identifier") return Option.none();
  return Option.some(type.typeName.name);
}

// Local change: returns Option instead of null.
function aliasSubstitutions(
  alias: ESTree.TSTypeAliasDeclaration,
  reference: ESTree.TSTypeReference,
  base: Substitutions,
): Option.Option<Substitutions> {
  const parameters = alias.typeParameters?.params ?? [];
  const typeArguments = reference.typeArguments?.params ?? [];
  const next = new Map(base);
  for (const [index, parameter] of parameters.entries()) {
    const explicitArgument = Arr.get(typeArguments, index);
    const argument = Option.orElse(explicitArgument, () => Option.fromNullishOr(parameter.default));
    if (Option.isNone(argument)) return Option.none();
    let argumentSubstitutions = base;
    if (Option.isNone(explicitArgument)) argumentSubstitutions = next;
    next.set(parameter.name.name, {
      type: argument.value,
      substitutions: new Map(argumentSubstitutions),
    });
  }
  return Option.some(next);
}

/** Match a type after resolving visible aliases and substituting their type parameters. */
// Local change: alias expansion is an Option pipeline instead of nested null checks.
export function resolvedTypeMatches(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment,
  matcher: ResolvedTypeMatcher,
): boolean {
  const evaluate = (
    current: ESTree.TSType,
    substitutions: Substitutions,
    resolvingAliases: ReadonlySet<ESTree.TSTypeAliasDeclaration>,
  ): boolean => {
    if (current.type === "TSTypeReference") {
      const name = typeReferenceName(current);
      if (Option.isSome(name)) {
        const substitution = substitutions.get(name.value);
        if (Predicate.isNotUndefined(substitution) && !current.typeArguments?.params.length) {
          return evaluate(substitution.type, substitution.substitutions, resolvingAliases);
        }
        const expansion = Option.flatMap(
          Option.filter(
            visibleTypeAlias(name.value, current, environment),
            (alias) => !resolvingAliases.has(alias),
          ),
          (alias) =>
            Option.map(aliasSubstitutions(alias, current, substitutions), (next) => ({
              alias,
              next,
            })),
        );
        if (Option.isSome(expansion)) {
          const { alias, next } = expansion.value;
          const nextResolving = new Set(resolvingAliases);
          nextResolving.add(alias);
          return evaluate(alias.typeAnnotation, next, nextResolving);
        }
      }
    }
    return matcher(current, (child) => evaluate(child, substitutions, resolvingAliases));
  };

  return evaluate(type, new Map(), new Set());
}
