/** Ban test lifecycle hooks in favor of Effect scopes and scoped test variants. */
import type { Definition, ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { memberName, nameBindings, type NameBindings } from "./_name-bindings.js";

const hookNames: ReadonlySet<string> = new Set([
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
]);

/** Specifier prefixes of the project's own modules: relative, absolute, and the usual path aliases. */
const projectPrefixes = [".", "/", "@/", "~", "#"] as const;

/**
 * A package a hook can come from (`bun:test`, `vitest`, `node:test`, `mocha`, ...):
 * any specifier that does not name one of the project's own modules, whose
 * helpers may share a hook's name.
 */
const isTestModule = (from: string): boolean =>
  !projectPrefixes.some((prefix) => from.startsWith(prefix));

/** Where a value comes from: a module, and the export read from it (none for the module whole). */
interface Origin {
  readonly from: string;
  readonly key: Option.Option<string>;
}

const wholeModule = (from: string): Origin => ({ from, key: Option.none() });

/** The name a property key spells: `name` or `"name"`. */
const propertyKey = (property: ESTree.Node): Option.Option<string> => {
  if (property.type !== "Property") return Option.none();
  if (!property.computed && property.key.type === "Identifier")
    return Option.some(property.key.name);
  if (property.key.type === "Literal" && Predicate.isString(property.key.value))
    return Option.some(property.key.value);
  return Option.none();
};

/** A call of `require`: the CommonJS global, or one made with `createRequire`. */
const isRequire = (callee: ESTree.Node): boolean =>
  callee.type === "Identifier" && callee.name === "require";

/** How many bindings an origin lookup follows (`const a = b.c`), so a cycle of names ends. */
const maxBindingHops = 8;

/** The export name an import specifier reads: `{ name }` or `{ "name" as local }`. */
const importedName = (imported: ESTree.ImportSpecifier["imported"]): string => {
  if (imported.type === "Identifier") return imported.name;
  return String(imported.value);
};

/** The origin of an import binding: a named export, or the module whole for a namespace or default import. */
const importOrigin = (definition: Definition): Option.Option<Origin> => {
  const declaration = definition.parent;
  if (declaration?.type !== "ImportDeclaration") return Option.none();
  const from = String(declaration.source.value);
  const specifier = definition.node;
  if (specifier.type !== "ImportSpecifier") return Option.some(wholeModule(from));
  const key = importedName(specifier.imported);
  if (key === "default") return Option.some(wholeModule(from));
  return Option.some({ from, key: Option.some(key) });
};

/** Where a binding, an expression or a member of either comes from, following up to `hops` bindings. */
const originOf = (
  bindings: NameBindings,
  node: ESTree.Node,
  hops: number,
): Option.Option<Origin> => {
  if (node.type === "Identifier") return bindingOrigin(bindings, node, hops);
  if (node.type === "MemberExpression") {
    return Option.flatMap(originOf(bindings, node.object, hops), (owner) =>
      Option.map(memberName(node), (key) => ({ from: owner.from, key: Option.some(key) })),
    );
  }
  if (node.type !== "CallExpression" || !isRequire(node.callee)) return Option.none();
  const [specifier] = node.arguments;
  if (specifier?.type !== "Literal" || !Predicate.isString(specifier.value)) return Option.none();
  return Option.some(wholeModule(specifier.value));
};

/** The origin of a variable: `x = <origin>`, or `{ key: x } = <origin>`, its member `key`. */
const variableOrigin = (
  bindings: NameBindings,
  definition: Definition,
  hops: number,
): Option.Option<Origin> => {
  const declarator = definition.node;
  if (declarator.type !== "VariableDeclarator" || !declarator.init) return Option.none();
  const init = originOf(bindings, declarator.init, hops);
  if (declarator.id === definition.name) return init;
  let property = definition.name.parent;
  if (property?.type === "AssignmentPattern") property = property.parent;
  if (property?.type !== "Property" || property.parent !== declarator.id) return Option.none();
  return Option.flatMap(init, (owner) =>
    Option.map(propertyKey(property), (key) => ({ from: owner.from, key: Option.some(key) })),
  );
};

const bindingOrigin = (
  bindings: NameBindings,
  id: ESTree.Node & { readonly name: string },
  hops: number,
): Option.Option<Origin> => {
  if (hops <= 0) return Option.none();
  return Option.flatMap(bindings.definitionOf(id), (definition) => {
    if (definition.type === "ImportBinding") return importOrigin(definition);
    if (definition.type === "Variable") return variableOrigin(bindings, definition, hops - 1);
    return Option.none();
  });
};

/** The origin of what a name or expression holds, kept only when it is a package's. */
const packageOrigin = (bindings: NameBindings, node: ESTree.Node): Option.Option<Origin> =>
  Option.filter(originOf(bindings, node, maxBindingHops), (origin) => isTestModule(origin.from));

/**
 * The hook a callee calls:
 * - a global hook;
 * - a package's hook under any local name (`import { afterAll as done }`, `const { afterAll } = require(...)`);
 * - a name spelled like a hook bound from a package (`import afterAll from "x"`), as 0.32.1 reported;
 * - `<x>.<hook>` on anything a package provides (`import * as ns`, `require("x")`, vitest's `test.beforeEach`).
 */
const hookOf = (bindings: NameBindings, callee: ESTree.Node): Option.Option<string> => {
  if (callee.type === "Identifier") {
    if (bindings.isGlobal(callee, callee.name))
      return Option.liftPredicate(callee.name, (name) => hookNames.has(name));
    return Option.flatMap(packageOrigin(bindings, callee), (origin) =>
      Option.orElse(
        Option.filter(origin.key, (key) => hookNames.has(key)),
        () => Option.liftPredicate(callee.name, (name) => hookNames.has(name)),
      ),
    );
  }
  if (callee.type !== "MemberExpression") return Option.none();
  if (Option.isNone(packageOrigin(bindings, callee.object))) return Option.none();
  return Option.filter(memberName(callee), (name) => hookNames.has(name));
};

export const noTestLifecycleHooks = Rule.define({
  name: "no-test-lifecycle-hooks",
  meta: Rule.meta({
    type: "problem",
    description: "Model test fixtures with Effect scopes instead of lifecycle hooks.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const bindings = nameBindings(ctx);

    return {
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        return Option.match(hookOf(bindings, node.callee), {
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
