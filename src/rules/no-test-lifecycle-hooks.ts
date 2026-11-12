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
  "FunctionExpression",
  "Literal",
  "UnaryExpression",
  "UpdateExpression",
]);

/** Wrappers that change an expression's type, not its value: `x as T`, `x!`, `(x)`, `a?.b`. */
const typeWrappers: ReadonlySet<string> = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSInstantiationExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
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
  | { readonly kind: "protocol" }
  | { readonly kind: "unknown" }
  | { readonly kind: "module"; readonly from: string; readonly key: Option.Option<string> };

type ModuleSource = Extract<Source, { readonly kind: "module" }>;

const local: Source = { kind: "local" };
/**
 * A local object or class that defines a protocol the language calls by itself: a
 * `then` (awaited, resolved) or a computed key (`[Symbol.iterator]`, `[Symbol.asyncIterator]`).
 * Read plainly it is the file's own; read through `await`, iteration or spread, the
 * value is what that code makes, which the rule does not follow.
 */
const protocol: Source = { kind: "protocol" };
const unknown: Source = { kind: "unknown" };

/** The sources of a value read through a protocol call (`await x`, `[a] = x`, `for (a of x)`, `...x`). */
const throughProtocol = (sources: ReadonlyArray<Source>): ReadonlyArray<Source> =>
  sources.map((source) => {
    if (source.kind === "protocol") return unknown;
    return source;
  });

/** Whether a key may name a protocol method: computed, or `then`. */
const isProtocolKey = (key: ESTree.Node, computed: boolean): boolean =>
  computed ||
  (key.type === "Identifier" && key.name === "then") ||
  (key.type === "Literal" && key.value === "then");

/** Whether an object literal defines a protocol method (see `protocol`). */
const definesProtocol = (node: ESTree.ObjectExpression): boolean =>
  node.properties.some(
    (property) => property.type === "Property" && isProtocolKey(property.key, property.computed),
  );
const moduleWhole = (from: string): Source => ({ kind: "module", from, key: Option.none() });

/** A source read at `key`: a module's export narrows to it, anything else keeps its kind. */
const member = (source: Source, key: Option.Option<string>): Source => {
  if (source.kind !== "module") return source;
  return { ...source, key };
};

/** Whether a source is proven not a package's: made locally, or one of the project's modules. */
const isOwn = (source: Source): boolean =>
  source.kind === "local" ||
  source.kind === "protocol" ||
  (source.kind === "module" && isProjectModule(source.from));

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
  const read = sources.map((source) => member(source, patternKey(name)));
  if (iteratedBetween(name, target)) return throughProtocol(read);
  return read;
};

/** Whether an array pattern sits between a name and its pattern's root: `[x] = v` iterates `v`. */
const iteratedBetween = (node: ESTree.Node, target: ESTree.Node): boolean => {
  if (node === target) return false;
  return Option.match(Option.fromNullishOr(node.parent), {
    onNone: () => false,
    onSome: (parent) => {
      if (parent.type === "ArrayPattern") return true;
      if (parent === target) return false;
      return iteratedBetween(parent, target);
    },
  });
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
    default:
      return Option.none();
  }
};

/** A function whose body the rule can read for what it returns. */
type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression";

/** A value read through code the rule does not follow: an object literal's getter or setter. */
const hasAccessor = (node: ESTree.Node): boolean =>
  node.type === "ObjectExpression" &&
  node.properties.some((property) => property.type === "Property" && property.kind !== "init");

/** A child of a node, when it is a node: a value of one of its visitor keys. */
const isNode = (value: unknown): value is ESTree.Node =>
  Predicate.hasProperty(value, "type") && Predicate.isString(value.type);

/** `for (const x of xs)` / `for (const k in o)`: the loop whose iterated value `x` takes from. */
const loopOf = (
  declaration: ESTree.Node,
): Option.Option<ESTree.ForOfStatement | ESTree.ForInStatement> => {
  const loop = declaration.parent;
  if (loop?.type !== "ForOfStatement" && loop?.type !== "ForInStatement") return Option.none();
  if (loop.left !== declaration) return Option.none();
  return Option.some(loop);
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
      return Option.match(Option.fromNullishOr(node.init), {
        onNone: () =>
          Option.match(loopOf(declaration), {
            onNone: () => [local],
            onSome: (loop) => bound(definition.name, node.id, loopSources(loop, hops)),
          }),
        onSome: (init) => bound(definition.name, node.id, sourcesOf(init, hops)),
      });
    };

    /** What a loop variable takes: an element `for…of` iterates out (a protocol call), or a key `for…in` names. */
    const loopSources = (
      loop: ESTree.ForOfStatement | ESTree.ForInStatement,
      hops: number,
    ): ReadonlyArray<Source> => {
      if (loop.type === "ForInStatement") return [local];
      return throughProtocol(sourcesOf(loop.right, hops));
    };

    /**
     * A parameter takes what its callers pass, so it is followed into every call:
     * only a function the file defines and calls directly, never passed, returned or
     * exported, has known callers. Any other parameter (a callback's, a method's) is
     * unknown, and so is a catch binding. A default value is followed too.
     */
    const parameterSources = (definition: Definition, hops: number): ReadonlyArray<Source> => {
      const fn = definition.node;
      if (!isFunctionNode(fn)) return [unknown];
      const top = paramTop(definition.name, fn);
      const position = fn.params.findIndex((param) => param === top);
      const passed = Option.match(callSitesOf(fn), {
        onNone: () => [unknown],
        onSome: (calls) =>
          calls.flatMap((call) =>
            argumentSources(call, position, top.type === "RestElement", hops),
          ),
      });
      return [
        ...bound(definition.name, top, passed),
        ...defaultsAbove(definition.name, fn).flatMap((value) =>
          bound(definition.name, value, sourcesOf(value, hops)),
        ),
      ];
    };

    /** The parameter a name is bound in: itself, or the pattern it sits in. */
    const paramTop = (node: ESTree.Node, fn: ESTree.Node): ESTree.Node =>
      Option.match(
        Option.filter(Option.fromNullishOr(node.parent), (parent) => parent !== fn),
        { onNone: () => node, onSome: (parent) => paramTop(parent, fn) },
      );

    /** What a call passes at a parameter's position; a spread before it, or a missing argument (`undefined`). */
    const argumentSources = (
      call: ESTree.CallExpression,
      position: number,
      rest: boolean,
      hops: number,
    ): ReadonlyArray<Source> => {
      if (position < 0) return [unknown];
      const before = call.arguments.slice(0, position + 1);
      if (before.some((argument) => argument.type === "SpreadElement")) return [unknown];
      const end = Option.getOrElse(
        Option.liftPredicate(position + 1, () => !rest),
        () => call.arguments.length,
      );
      const passed = call.arguments.slice(position, end);
      return [local, ...passed.flatMap((argument) => sourcesOf(argument, hops))];
    };

    /** The outermost expression a node is, through type wrappers: `(f as T)`, `f!`. */
    const outermost = (node: ESTree.Node): ESTree.Node =>
      Option.match(
        Option.filter(
          Option.fromNullishOr(node.parent),
          (parent) =>
            typeWrappers.has(parent.type) &&
            Option.exists(wrapped(parent), (inner) => inner === node),
        ),
        { onNone: () => node, onSome: outermost },
      );

    /** The call a node is the callee of, through type wrappers. */
    const callOf = (node: ESTree.Node): Option.Option<ESTree.CallExpression> => {
      const top = outermost(node);
      return Option.filter(
        Option.flatMap(Option.fromNullishOr(top.parent), (parent) => {
          if (parent.type !== "CallExpression") return Option.none();
          return Option.some(parent);
        }),
        (call) => call.callee === top,
      );
    };

    /**
     * Every call of a function, when all its uses are known: an IIFE, or a name
     * (a declaration, or a `const` it initialises) read only as a direct callee.
     * A function passed, returned, exported or put in a value escapes: none.
     */
    const callSitesOf = (fn: FunctionNode): Option.Option<ReadonlyArray<ESTree.CallExpression>> => {
      const direct = callOf(fn);
      if (Option.isSome(direct)) return Option.some([direct.value]);
      const names = namesOf(fn);
      if (Option.isNone(names)) return Option.none();
      const reads = names.value.flatMap((variable) =>
        variable.references.filter((reference) => !reference.isWrite()),
      );
      const calls = reads.flatMap((reference) => Option.toArray(callOf(reference.identifier)));
      return Option.liftPredicate(calls, (found) => found.length === reads.length);
    };

    /**
     * The names a function is known by: its own name, and the variable it initialises.
     * None when it is exported, or held anywhere else (an argument, a property, a return).
     */
    const namesOf = (fn: FunctionNode): Option.Option<ReadonlyArray<Variable>> => {
      const top = outermost(fn);
      const holder = top.parent;
      if (holder?.type === "ExportNamedDeclaration" || holder?.type === "ExportDefaultDeclaration")
        return Option.none();
      const own = ctx.sourceCode
        .getDeclaredVariables(fn)
        .filter((variable) =>
          variable.defs.some((definition) => definition.type === "FunctionName"),
        );
      if (fn.type === "FunctionDeclaration") return Option.some(own);
      if (
        holder?.type !== "VariableDeclarator" ||
        holder.init !== top ||
        holder.id.type !== "Identifier"
      )
        return Option.none();
      return Option.some([...own, ...ctx.sourceCode.getDeclaredVariables(holder)]);
    };

    /** The default values a pattern position sits under, up to its function: `(x = d)`, `({ x } = d)`. */
    const defaultsAbove = (node: ESTree.Node, fn: ESTree.Node): ReadonlyArray<ESTree.Node> =>
      Option.match(
        Option.filter(Option.fromNullishOr(node.parent), (parent) => parent !== fn),
        {
          onNone: () => [],
          onSome: (parent) => {
            const above = defaultsAbove(parent, fn);
            if (parent.type === "AssignmentPattern" && parent.left === node)
              return [parent.right, ...above];
            return above;
          },
        },
      );

    /** A static member's value: a field's initialiser; a method is the class's own; an accessor is not followed. */
    const staticSources = (
      element: Exclude<ESTree.ClassElement, ESTree.StaticBlock | ESTree.TSIndexSignature>,
      hops: number,
    ): ReadonlyArray<Source> => {
      if (element.type === "MethodDefinition" || element.type === "TSAbstractMethodDefinition") {
        if (element.kind === "get" || element.kind === "set") return [unknown];
        return [];
      }
      return Option.match(Option.fromNullishOr(element.value), {
        onNone: () => [],
        onSome: (value) => sourcesOf(value, hops),
      });
    };

    /** A class as a value: its statics, its base class; a decorator or static block is not followed. */
    const classSources = (node: ESTree.Node, hops: number): ReadonlyArray<Source> => {
      if (node.type !== "ClassDeclaration" && node.type !== "ClassExpression") return [unknown];
      if (isAmbient(node) || node.decorators.length > 0) return [unknown];
      const statics = node.body.body.flatMap((element): ReadonlyArray<Source> => {
        if (element.type === "StaticBlock") return [unknown];
        if (element.type === "TSIndexSignature") return [];
        // A decorator is a call the language makes on the class's definition, and may replace any part.
        if (element.decorators.length > 0) return [unknown];
        if (!element.static) return [];
        return [
          ...Option.toArray(
            Option.liftPredicate(protocol, () => isProtocolKey(element.key, element.computed)),
          ),
          ...staticSources(element, hops),
        ];
      });
      const base = Option.match(Option.fromNullishOr(node.superClass), {
        onNone: (): ReadonlyArray<Source> => [],
        onSome: (superClass) => sourcesOf(superClass, hops),
      });
      return [local, ...base, ...statics];
    };

    /** Where a definition's value comes from. */
    const definitionSources = (definition: Definition, hops: number): ReadonlyArray<Source> => {
      switch (definition.type) {
        case "Parameter":
          return parameterSources(definition, hops);
        case "CatchClause":
          // What a `catch` binds is whatever was thrown, by any code its `try` ran.
          return [unknown];
        case "FunctionName":
          if (isAmbient(definition.node)) return [unknown];
          return [local];
        case "ClassName":
          return classSources(definition.node, hops);
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
          if (assignment?.type === "ForOfStatement" || assignment?.type === "ForInStatement")
            return bound(reference.identifier, assignment.left, loopSources(assignment, hops));
          if (assignment?.type !== "AssignmentExpression") return [unknown];
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
            ...Option.toArray(
              Option.liftPredicate(unknown, () => !isSealed(variable, id, hops - 1)),
            ),
          ],
        },
      );
    };

    /** The outermost read a name is part of: `o`, `o.a.b`, `(o as T).a`. */
    const readTop = (id: ESTree.Node): ESTree.Node =>
      Option.match(Option.fromNullishOr(id.parent), {
        onNone: () => id,
        onSome: (parent) => {
          if (parent.type === "MemberExpression" && parent.object === id) return readTop(parent);
          if (
            typeWrappers.has(parent.type) &&
            Option.exists(wrapped(parent), (inner) => inner === id)
          )
            return readTop(parent);
          return id;
        },
      });

    /** Whether a read leaves its binding unchanged: a direct call, an alias that is sealed, a value used up. */
    const readSeals = (
      id: ESTree.Node,
      top: ESTree.Node,
      parent: ESTree.Node,
      except: ESTree.Node,
      hops: number,
    ): boolean => {
      if (parent.type === "VariableDeclarator" && parent.init === top)
        return ctx.sourceCode
          .getDeclaredVariables(parent)
          .every((alias) => isSealed(alias, except, hops - 1));
      if (top === id && parent.type === "CallExpression" && parent.callee === top) return true;
      return top !== id && consumed(parent, top);
    };

    /** A read whose value is used up where it is read: a test, an operand, a statement. */
    const consumed = (parent: ESTree.Node, top: ESTree.Node): boolean => {
      switch (parent.type) {
        case "IfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "SwitchStatement":
        case "BinaryExpression":
        case "TemplateLiteral":
        case "ExpressionStatement":
        case "ExportSpecifier":
        case "TSTypeQuery":
          return true;
        case "UnaryExpression":
          return parent.operator !== "delete";
        case "ConditionalExpression":
          return parent.test === top;
        default:
          return false;
      }
    };

    /**
     * Whether nothing but plain reads can change what a binding holds: every other
     * read is a direct call, a member read used up in place, or an alias that is
     * itself sealed. A binding passed to a call (`Object.assign(o, ...)`), a member
     * assigned (`o.a = ...`) or a method called (`o.load()`) may be changed.
     */
    const isSealed = (variable: Variable, except: ESTree.Node, hops: number): boolean => {
      if (variable.defs.some((definition) => definition.node.type === "ImportNamespaceSpecifier"))
        return true;
      if (hops <= 0) return false;
      return variable.references.every((reference) => {
        const id = reference.identifier;
        if (reference.isWrite() || id === except) return true;
        const top = readTop(id);
        return Option.exists(Option.fromNullishOr(top.parent), (parent) =>
          readSeals(id, top, parent, except, hops),
        );
      });
    };

    /** The functions a callee calls, when it is one the file defines and never rebinds. */
    const functionsOf = (callee: ESTree.Node): Option.Option<ReadonlyArray<FunctionNode>> => {
      const target = unwrap(callee);
      if (isFunctionNode(target)) return Option.some([target]);
      if (target.type !== "Identifier") return Option.none();
      return Option.flatMap(variableOf(target), (variable) => {
        if (variable.references.some((reference) => reference.isWrite() && !reference.init))
          return Option.none();
        const functions = variable.defs.flatMap((definition) => {
          const node = definition.node;
          if (definition.type === "FunctionName" && isFunctionNode(node)) return [node];
          if (node.type !== "VariableDeclarator" || node.id !== definition.name) return [];
          return Option.toArray(Option.filter(Option.fromNullishOr(node.init), isFunctionNode)).map(
            (init) => init,
          );
        });
        return Option.liftPredicate(functions, (found) => found.length === variable.defs.length);
      });
    };

    /** The `return` statements of a body, outside its nested functions: each one's value, if any. */
    const returnsIn = (node: ESTree.Node): ReadonlyArray<Option.Option<ESTree.Node>> => {
      if (node.type === "ReturnStatement") return [Option.fromNullishOr(node.argument)];
      if (isFunctionNode(node)) return [];
      const keys = new Set(ctx.sourceCode.visitorKeys[node.type] ?? []);
      return Object.entries(node)
        .filter(([key]) => keys.has(key))
        .flatMap(([, child]: [string, unknown]) => [child].flat())
        .flatMap((child) => Option.toArray(Option.liftPredicate(child, isNode)))
        .flatMap(returnsIn);
    };

    /** What a function returns: its body's value, or each `return`'s; a generator is not followed. */
    const returnSources = (fn: FunctionNode, hops: number): ReadonlyArray<Source> => {
      if (fn.generator) return [unknown];
      return Option.match(Option.fromNullishOr(fn.body), {
        onNone: () => [unknown],
        onSome: (body) => bodySources(body, hops),
      });
    };

    /** A function body's value: a concise body's expression, or what each `return` gives (none: local). */
    const bodySources = (body: ESTree.Node, hops: number): ReadonlyArray<Source> => {
      if (body.type !== "BlockStatement") return sourcesOf(body, hops);
      const returns = body.body.flatMap(returnsIn);
      return [
        local,
        ...returns.flatMap((value) =>
          Option.match(value, { onNone: () => [local], onSome: (node) => sourcesOf(node, hops) }),
        ),
      ];
    };

    /**
     * A call's value: a module for `require("x")`; what a function the file defines
     * returns, with its arguments; what a project module's export makes. Any other
     * call's or construction's result is unknown.
     */
    const callSources = (
      node: ESTree.CallExpression | ESTree.NewExpression,
      hops: number,
    ): ReadonlyArray<Source> => {
      if (hops <= 0) return [unknown];
      if (node.type === "CallExpression" && isRequire(node.callee, hops))
        return [moduleOf(Option.fromUndefinedOr(node.arguments[0]))];
      return invokeSources(node.callee, node.arguments, node.type === "NewExpression", hops);
    };

    /**
     * What calling `callee` with `args` gives, for an explicit call and for one the
     * language makes (a tagged template calls its tag): what a function the file
     * defines returns, with its arguments; what a project export makes; else unknown.
     */
    const invokeSources = (
      calleeNode: ESTree.Node,
      argumentNodes: ReadonlyArray<ESTree.Node>,
      construct: boolean,
      hops: number,
    ): ReadonlyArray<Source> => {
      const args = argumentNodes.flatMap((argument) => sourcesOf(argument, hops));
      const followed = Option.filter(functionsOf(calleeNode), () => !construct);
      if (Option.isSome(followed))
        return [...followed.value.flatMap((fn) => returnSources(fn, hops - 1)), ...args];
      const callee = sourcesOf(calleeNode, hops);
      if (
        callee.length > 0 &&
        callee.every((source) => source.kind === "module" && isProjectModule(source.from))
      )
        return [...callee, ...args];
      return [unknown];
    };

    /** Where an expression's value can come from; an unmodelled form is unknown. */
    const sourcesOf = (node: ESTree.Node, hops: number): ReadonlyArray<Source> => {
      if (madeHere.has(node.type)) return [local];
      const inner = wrapped(node);
      if (Option.isSome(inner)) return sourcesOf(inner.value, hops);
      if (hasAccessor(node)) return [unknown];
      const made = parts(node);
      if (Option.isSome(made))
        return [
          ...Option.toArray(
            Option.liftPredicate(
              protocol,
              () => node.type === "ObjectExpression" && definesProtocol(node),
            ),
          ),
          ...made.value.flatMap((part) => sourcesOf(part, hops)),
        ];
      return implicitSources(node, hops);
    };

    /**
     * The forms where the language calls code by itself: `await` resolves a thenable,
     * a spread iterates, a tagged template calls its tag. What that code gives is
     * followed only as far as an explicit call would be.
     */
    const implicitSources = (node: ESTree.Node, hops: number): ReadonlyArray<Source> => {
      switch (node.type) {
        case "AwaitExpression":
          return throughProtocol(sourcesOf(node.argument, hops));
        case "SpreadElement":
          if (node.parent?.type === "ObjectExpression") return sourcesOf(node.argument, hops);
          return throughProtocol(sourcesOf(node.argument, hops));
        case "TaggedTemplateExpression":
          if (hops <= 0) return [unknown];
          return invokeSources(node.tag, node.quasi.expressions, false, hops);
        default:
          return namedSources(node, hops);
      }
    };

    /** A name, a member, a class, an import or a call. */
    const namedSources = (node: ESTree.Node, hops: number): ReadonlyArray<Source> => {
      switch (node.type) {
        case "Identifier":
          return bindingSources(node, hops);
        case "ClassExpression":
          return classSources(node, hops);
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
