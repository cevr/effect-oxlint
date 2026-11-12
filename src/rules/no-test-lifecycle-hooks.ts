/**
 * Ban test lifecycle hooks in favor of Effect scopes and scoped test variants.
 *
 * The rule fails closed: a call of a name spelled like a hook is reported, as
 * 0.32.1 reported it, unless every value the name can hold is proven the
 * file's own or the project's. A binding form the rule does not model reads as
 * unknown, and an unknown value is reported.
 */
import type { Definition, ESTree, Reference, Variable } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { memberName } from "./_name-bindings.js";

const hookNames: ReadonlySet<string> = new Set([
  "after",
  "afterAll",
  "afterEach",
  "before",
  "beforeAll",
  "beforeEach",
]);

/** Test-runner objects whose `<runner>.<hook>` is a hook too (vitest's `test.beforeEach`). */
const runnerNames: ReadonlySet<string> = new Set(["describe", "it", "test"]);

/** Specifier prefixes of the project's own modules: relative, absolute, and the usual path aliases. */
const projectPrefixes = [".", "/", "@/", "~", "#"] as const;

const isProjectModule = (from: string): boolean =>
  projectPrefixes.some((prefix) => from.startsWith(prefix));

/** Node types whose value is made where it is written: a literal, a function, an operator's result. */
const madeHere: ReadonlySet<string> = new Set([
  "ArrowFunctionExpression",
  "BinaryExpression",
  "ClassExpression",
  "FunctionExpression",
  "Literal",
  "UnaryExpression",
  "UpdateExpression",
]);

/** The modules `createRequire` comes from. */
const moduleModules: ReadonlySet<string> = new Set(["module", "node:module"]);

/** A name, where it is read. */
type Named = ESTree.Node & { readonly name: string };

/**
 * Where a value can come from:
 * - `local`: made in this file (a function, a literal, a parameter);
 * - `module`: an export of a module (`key`, or the module whole), the project's own or a package's;
 * - `unknown`: anything not traced (a global, `this`, an unmodelled form).
 */
type Source =
  | { readonly kind: "local" }
  | { readonly kind: "unknown" }
  | { readonly kind: "module"; readonly from: string; readonly key: Option.Option<string> };

type ModuleSource = Extract<Source, { readonly kind: "module" }>;

const local: Source = { kind: "local" };
const unknown: Source = { kind: "unknown" };
const moduleWhole = (from: string): Source => ({ kind: "module", from, key: Option.none() });

/** A source read at `key`: a module's export narrows to it, anything else keeps its kind. */
const member = (source: Source, key: Option.Option<string>): Source => {
  if (source.kind !== "module") return source;
  return { ...source, key };
};

/** Whether a source is proven not a package's: made locally, or one of the project's modules. */
const isOwn = (source: Source): boolean =>
  source.kind === "local" || (source.kind === "module" && isProjectModule(source.from));

/** Whether a source is a package's export (the module whole for an unknown key). */
const isPackage = (source: Source): source is ModuleSource =>
  source.kind === "module" && !isProjectModule(source.from);

/** How many bindings a lookup follows (`const a = b.c`); past it, a value's source is unknown. */
const maxBindingHops = 8;

/** The name a property key spells: `name` or `"name"`. */
const propertyKey = (property: ESTree.Node): Option.Option<string> => {
  if (property.type !== "Property") return Option.none();
  if (!property.computed && property.key.type === "Identifier")
    return Option.some(property.key.name);
  if (property.key.type === "Literal" && Predicate.isString(property.key.value))
    return Option.some(property.key.value);
  return Option.none();
};

/** The export name an import specifier reads: `{ name }` or `{ "name" as local }`. */
const importedName = (imported: ESTree.ImportSpecifier["imported"]): string => {
  if (imported.type === "Identifier") return imported.name;
  return String(imported.value);
};

/** A module named by a string: `"x"` or `` `x` ``; any other specifier is unknown. */
const moduleOf = (specifier: Option.Option<ESTree.Node>): Source => {
  if (Option.isNone(specifier)) return unknown;
  const node = specifier.value;
  if (node.type === "Literal" && Predicate.isString(node.value)) return moduleWhole(node.value);
  if (node.type !== "TemplateLiteral" || node.expressions.length > 0) return unknown;
  return Option.match(Option.fromNullishOr(node.quasis[0]?.value.cooked), {
    onNone: () => unknown,
    onSome: moduleWhole,
  });
};

/** The key a pattern binds `name` under: `{ key: name }`, `{ key: name = d }`; none in an array or rest. */
const patternKey = (name: ESTree.Node): Option.Option<string> => {
  let property = name.parent;
  if (property?.type === "AssignmentPattern" && property.left === name) property = property.parent;
  if (property?.type !== "Property" || property.parent?.type !== "ObjectPattern")
    return Option.none();
  return propertyKey(property);
};

/** What a binding takes from a value: the value whole (`x = v`), or its member under the pattern's key. */
const bound = (
  name: ESTree.Node,
  target: ESTree.Node,
  sources: ReadonlyArray<Source>,
): ReadonlyArray<Source> => {
  if (name === target) return sources;
  return sources.map((source) => member(source, patternKey(name)));
};

/** An expression its wrapper passes through unchanged: `x as T`, `x!`, `(x)`, `await x`, `a?.b`. */
const wrapped = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  switch (node.type) {
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
    case "TSInstantiationExpression":
    case "ParenthesizedExpression":
    case "ChainExpression":
      return Option.some(node.expression);
    case "AwaitExpression":
    case "SpreadElement":
      return Option.some(node.argument);
    case "AssignmentExpression":
      return Option.some(node.right);
    case "SequenceExpression":
      return Option.fromUndefinedOr(node.expressions.at(-1));
    default:
      return Option.none();
  }
};

/** A callee with its wrappers taken off: `(afterAll as T)`, `afterAll!`, `(0, afterAll)`. */
const unwrap = (node: ESTree.Node): ESTree.Node =>
  Option.match(wrapped(node), { onNone: () => node, onSome: unwrap });

/** The expressions a composite value is made from: an object's values, an array's elements, a branch. */
const parts = (node: ESTree.Node): Option.Option<ReadonlyArray<ESTree.Node>> => {
  switch (node.type) {
    case "TemplateLiteral":
      return Option.some(node.expressions);
    case "ObjectExpression":
      return Option.some(
        node.properties.map((property) => {
          if (property.type === "Property") return property.value;
          return property;
        }),
      );
    case "ArrayExpression":
      return Option.some(node.elements.filter(Predicate.isNotNull));
    case "ConditionalExpression":
      return Option.some([node.consequent, node.alternate]);
    case "LogicalExpression":
      return Option.some([node.left, node.right]);
    case "TaggedTemplateExpression":
      return Option.some([node.tag, ...node.quasi.expressions]);
    default:
      return Option.none();
  }
};

/** `for (const x of xs)`: the iterated value `x` takes an element of. */
const loopValue = (declaration: ESTree.Node): Option.Option<ESTree.Node> => {
  const loop = declaration.parent;
  if (loop?.type !== "ForOfStatement" && loop?.type !== "ForInStatement") return Option.none();
  if (loop.left !== declaration) return Option.none();
  return Option.some(loop.right);
};

/** `declare function afterAll(...)`, `declare class`: an ambient declaration of something defined elsewhere. */
const isAmbient = (node: ESTree.Node): boolean =>
  node.type === "TSDeclareFunction" ||
  (Predicate.hasProperty(node, "declare") && node.declare === true);

/** The source an import binding reads: a named export, or the module whole. */
const importSource = (definition: Definition): Source => {
  const node = definition.node;
  if (node.type === "TSImportEqualsDeclaration") {
    const reference = node.moduleReference;
    if (reference.type !== "TSExternalModuleReference") return unknown;
    return moduleOf(Option.some(reference.expression));
  }
  const declaration = definition.parent;
  if (declaration?.type !== "ImportDeclaration") return unknown;
  const from = String(declaration.source.value);
  if (node.type !== "ImportSpecifier") return moduleWhole(from);
  const key = importedName(node.imported);
  if (key === "default") return moduleWhole(from);
  return { kind: "module", from, key: Option.some(key) };
};

export const noTestLifecycleHooks = Rule.define({
  name: "no-test-lifecycle-hooks",
  meta: Rule.meta({
    type: "problem",
    description: "Model test fixtures with Effect scopes instead of lifecycle hooks.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    const variableOf = (id: Named): Option.Option<Variable> =>
      Scope.findVariableUp(ctx.sourceCode.getScope(id), id.name);

    /** Where a variable's declared value comes from: its initializer, or the value a loop iterates. */
    const variableSources = (definition: Definition, hops: number): ReadonlyArray<Source> => {
      const node = definition.node;
      if (node.type !== "VariableDeclarator") return [unknown];
      const declaration = node.parent;
      if (declaration?.type !== "VariableDeclaration" || isAmbient(declaration)) return [unknown];
      const value = Option.orElse(Option.fromNullishOr(node.init), () => loopValue(declaration));
      return Option.match(value, {
        onNone: () => [local],
        onSome: (init) => bound(definition.name, node.id, sourcesOf(init, hops)),
      });
    };

    /** Where a definition's value comes from. */
    const definitionSources = (definition: Definition, hops: number): ReadonlyArray<Source> => {
      switch (definition.type) {
        case "Parameter":
        case "CatchClause":
          return [local];
        case "FunctionName":
        case "ClassName":
          if (isAmbient(definition.node)) return [unknown];
          return [local];
        case "ImportBinding":
          return [importSource(definition)];
        case "Variable":
          return variableSources(definition, hops);
        default:
          return [unknown];
      }
    };

    /** A later write `x = v` or `({ x } = v)`: what `x` takes from `v`. */
    const writeSources = (reference: Reference, hops: number): ReadonlyArray<Source> =>
      Option.match(Option.fromNullishOr(reference.writeExpr), {
        onNone: () => [unknown],
        onSome: (value) => {
          const assignment = value.parent;
          const sources = sourcesOf(value, hops);
          if (assignment?.type !== "AssignmentExpression")
            return bound(reference.identifier, value, sources);
          return bound(reference.identifier, assignment.left, sources);
        },
      });

    /** Where a name's value can come from: every definition, and every later write. */
    const bindingSources = (id: Named, hops: number): ReadonlyArray<Source> => {
      if (hops <= 0) return [unknown];
      return Option.match(
        Option.filter(variableOf(id), (variable) => variable.defs.length > 0),
        {
          onNone: () => [unknown],
          onSome: (variable) => [
            ...variable.defs.flatMap((definition) => definitionSources(definition, hops - 1)),
            ...variable.references
              .filter((reference) => reference.isWrite() && !reference.init)
              .flatMap((reference) => writeSources(reference, hops - 1)),
          ],
        },
      );
    };

    /** A call's value: a module for `require("x")`, else whatever its callee and arguments are. */
    const callSources = (
      node: ESTree.CallExpression | ESTree.NewExpression,
      hops: number,
    ): ReadonlyArray<Source> => {
      if (node.type === "CallExpression" && isRequire(node.callee, hops))
        return [moduleOf(Option.fromUndefinedOr(node.arguments[0]))];
      return [node.callee, ...node.arguments].flatMap((part) => sourcesOf(part, hops));
    };

    /** Where an expression's value can come from; an unmodelled form is unknown. */
    const sourcesOf = (node: ESTree.Node, hops: number): ReadonlyArray<Source> => {
      if (madeHere.has(node.type)) return [local];
      const inner = wrapped(node);
      if (Option.isSome(inner)) return sourcesOf(inner.value, hops);
      const made = parts(node);
      if (Option.isSome(made)) return made.value.flatMap((part) => sourcesOf(part, hops));
      switch (node.type) {
        case "Identifier":
          return bindingSources(node, hops);
        case "MemberExpression":
          return sourcesOf(node.object, hops).map((source) => member(source, memberName(node)));
        case "ImportExpression":
          return [moduleOf(Option.some(node.source))];
        case "CallExpression":
        case "NewExpression":
          return callSources(node, hops);
        default:
          return [unknown];
      }
    };

    /** `createRequire(...)`: a call of `node:module`'s `createRequire`. */
    const isCreateRequire = (node: ESTree.Node, hops: number): boolean =>
      node.type === "CallExpression" &&
      sourcesOf(node.callee, hops).some(
        (source) =>
          source.kind === "module" &&
          moduleModules.has(source.from) &&
          Option.exists(source.key, (key) => key === "createRequire"),
      );

    /** A `require`: any binding named so, `createRequire(...)`, or a name bound to one. */
    const isRequire = (callee: ESTree.Node, hops: number): boolean => {
      const target = unwrap(callee);
      if (isCreateRequire(target, hops)) return true;
      if (target.type !== "Identifier") return false;
      if (target.name === "require") return true;
      return Option.exists(variableOf(target), (variable) =>
        variable.defs.some(
          (definition) =>
            definition.node.type === "VariableDeclarator" &&
            definition.node.id === definition.name &&
            Option.exists(Option.fromNullishOr(definition.node.init), (init) =>
              isCreateRequire(unwrap(init), hops - 1),
            ),
        ),
      );
    };

    /** Whether a name, spelled like a hook or a runner, may hold a package's: not proven the file's or the project's. */
    const mayBePackages = (id: Named): boolean => !bindingSources(id, maxBindingHops).every(isOwn);

    /** The hook a package export is, by the export's name. */
    const packageHook = (sources: ReadonlyArray<Source>): Option.Option<string> =>
      Option.fromUndefinedOr(
        sources
          .filter(isPackage)
          .flatMap((source) => Option.toArray(source.key))
          .find((key) => hookNames.has(key)),
      );

    /** `<x>.<hook>`: on a runner name not proven own, or on anything a package provides. */
    const memberHook = (callee: ESTree.MemberExpression): Option.Option<string> =>
      Option.filter(memberName(callee), (name) => {
        if (!hookNames.has(name)) return false;
        const owner = unwrap(callee.object);
        if (owner.type === "Identifier" && runnerNames.has(owner.name) && mayBePackages(owner))
          return true;
        return sourcesOf(owner, maxBindingHops).some(isPackage);
      });

    /**
     * The hook a callee calls:
     * - a name spelled like a hook, unless it is proven local or the project's own (0.32.1 reported every such name);
     * - a package's hook under any local name (`import { afterAll as done }`, `const { afterAll: done } = require(...)`);
     * - `<runner>.<hook>` (vitest's `test.beforeEach`), unless the runner name is proven local or the project's;
     * - `<x>.<hook>` on anything a package provides (`import * as ns`, `require("x")`).
     */
    const hookOf = (callee: ESTree.Node): Option.Option<string> => {
      const target = unwrap(callee);
      if (target.type === "MemberExpression") return memberHook(target);
      if (target.type !== "Identifier") return Option.none();
      if (hookNames.has(target.name) && mayBePackages(target)) return Option.some(target.name);
      return packageHook(bindingSources(target, maxBindingHops));
    };

    return {
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        return Option.match(hookOf(node.callee), {
          onNone: () => Effect.void,
          onSome: (name) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `Avoid ${name}(). Use effect-bun-test scoped tests and Effect.acquireRelease for fixture lifecycles.`,
              }),
            ),
        });
      },
    };
  },
});
