/** Construct shared caches in their owning layer, not on every operation call. */
import type { ESTree, Variable } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { enclosingEffectProgram } from "./_effect-context.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const cachedEffectOperations = new Set(["cached", "cachedInvalidateWithTTL", "cachedWithTTL"]);
const cacheConstructors = new Set(["make", "makeWith"]);

const isOperation = (
  node: ESTree.Expression,
  namespaces: ReadonlySet<string>,
  operations: ReadonlySet<string>,
): boolean => {
  for (const operation of operations) {
    if (isStaticMember(node, namespaces, operation)) return true;
  }
  return false;
};

/**
 * Whether the generator of an `Effect.gen` runs once per call of a
 * function around it: the gen is inside a function, and no `Layer` call
 * between them builds it once. A gen at module level, or the argument of
 * `Layer.effect` and its kin, is its cache's owner.
 */
const perCallGen = (program: ESTree.Node, layers: ReadonlySet<string>): boolean => {
  for (const ancestor of ancestors(program)) {
    if (ancestor.type === "CallExpression" && ancestor.callee.type === "MemberExpression") {
      const object = ancestor.callee.object;
      if (object.type === "Identifier" && layers.has(object.name)) return false;
    }
    if (isFunction(ancestor)) return true;
  }
  return false;
};

const isFunction = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

const nearestFunction = (node: ESTree.Node): Option.Option<ESTree.Node> =>
  Arr.findFirst(ancestors(node), isFunction);

/**
 * Whether the cache the call builds is bound to a const and only used in
 * the generator that built it: read through (`cache.get(key)`) or yielded
 * (`yield* get`), never returned, stored or captured by a closure. A cache
 * that leaves its generator (a service constructor's method uses it) is
 * owned by what it builds, not rebuilt per call.
 */
const usedOnlyHere = (
  call: ESTree.CallExpression,
  generator: ESTree.Node,
  declared: (node: ESTree.VariableDeclarator) => ReadonlyArray<Variable>,
): boolean => {
  const yielded = call.parent;
  if (yielded?.type !== "YieldExpression" || !yielded.delegate) return false;
  const declarator = yielded.parent;
  if (declarator?.type !== "VariableDeclarator" || declarator.id.type !== "Identifier") return false;
  const variables = declared(declarator);
  return (
    variables.length === 1 &&
    variables.every((variable) =>
      variable.references.every((reference) => {
        if (reference.init) return true;
        const read = reference.identifier;
        if (!Option.contains(nearestFunction(read), generator)) return false;
        const parent = read.parent;
        return (
          (parent?.type === "MemberExpression" && parent.object === read) ||
          (parent?.type === "YieldExpression" && parent.argument === read)
        );
      }),
    )
  );
};

export const noPerCallCacheConstruction = Rule.define({
  name: "no-per-call-cache-construction",
  meta: Rule.meta({
    type: "suggestion",
    description: "Construct shared caches once in their owning layer.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const cacheNamespaces = new Set(["Cache"]);
    const layerNamespaces = new Set(["Layer"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Cache", "effect/Cache")) {
          cacheNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Layer", "effect/Layer")) {
          layerNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        const layers = visibleNamespaces(ctx, node, layerNamespaces);
        const insideOperation = Option.exists(
          enclosingEffectProgram(node, effects),
          ([program, kind]) =>
            kind !== "gen" ||
            (perCallGen(program, layers) &&
              usedOnlyHere(node, program, (declarator) => ctx.sourceCode.getDeclaredVariables(declarator))),
        );
        if (!insideOperation) return Effect.void;
        const caches = visibleNamespaces(ctx, node, cacheNamespaces);
        const constructsCache =
          isOperation(node.callee, effects, cachedEffectOperations) ||
          isOperation(node.callee, caches, cacheConstructors);
        if (!constructsCache) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Construct this cache once in its owning layer. Creating it inside an Effect operation creates new cache state on every call.",
          }),
        );
      },
    };
  },
});
