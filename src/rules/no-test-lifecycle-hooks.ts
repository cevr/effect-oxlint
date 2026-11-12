/**
 * Ban test lifecycle hooks in favor of Effect scopes and scoped test variants.
 *
 * The rule reports every call of a callee spelled like a hook, as 0.32.1 did,
 * and lets through only a plain name whose one binding is one of three local
 * shapes (see `isLocalHook`). It tracks no values: any other binding, however
 * local it looks, is reported.
 */
import type { ESTree, Variable } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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

/** Wrappers that leave a callee's value as it is: `(f as T)`, `f!`, `(f)`, `(0, f)`. */
const unwrap = (node: ESTree.Node): ESTree.Node => {
  switch (node.type) {
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
    case "TSInstantiationExpression":
    case "ParenthesizedExpression":
    case "ChainExpression":
      return unwrap(node.expression);
    case "SequenceExpression":
      return Option.match(Option.fromUndefinedOr(node.expressions.at(-1)), {
        onNone: () => node,
        onSome: unwrap,
      });
    default:
      return node;
  }
};

/** The module an import binding reads, for a value import: `import x`, `import { x }`, `import * as x`. */
const importedFrom = (node: ESTree.Node): Option.Option<string> => {
  const declaration = node.parent;
  if (declaration?.type !== "ImportDeclaration" || declaration.importKind === "type")
    return Option.none();
  if (node.type === "ImportSpecifier" && node.importKind === "type") return Option.none();
  return Option.some(String(declaration.source.value));
};

/** A variable's one binding, when nothing rebinds it later. */
const onlyBinding = (variable: Variable): Option.Option<Variable["defs"][number]> => {
  if (variable.defs.length !== 1) return Option.none();
  if (variable.references.some((reference) => reference.isWrite() && !reference.init))
    return Option.none();
  return Option.fromUndefinedOr(variable.defs[0]);
};

/**
 * Whether a name spelled like a hook is the file's or the project's own. Its one
 * binding must be exactly one of:
 * 1. a function declaration in the file;
 * 2. `const name = () => {}` or `const name = function () {}`, the literal itself;
 * 3. a default or named value import from a project path.
 * Nothing else is: a parameter, a `catch` binding, a destructuring (defaults
 * included), `let`/`var`, a call's result, `require`, a member, a namespace.
 */
const isLocalHook = (variable: Variable): boolean =>
  Option.exists(onlyBinding(variable), (definition) => {
    const node = definition.node;
    switch (node.type) {
      case "FunctionDeclaration":
        return definition.type === "FunctionName";
      case "VariableDeclarator":
        return (
          node.id === definition.name &&
          node.parent?.type === "VariableDeclaration" &&
          node.parent.kind === "const" &&
          node.parent.declare !== true &&
          (node.init?.type === "ArrowFunctionExpression" ||
            node.init?.type === "FunctionExpression")
        );
      case "ImportDefaultSpecifier":
      case "ImportSpecifier":
        return Option.exists(importedFrom(node), isProjectModule);
      default:
        return false;
    }
  });

/** The export name an import specifier reads: `{ name }` or `{ "name" as local }`. */
const importedName = (imported: ESTree.ImportSpecifier["imported"]): string => {
  if (imported.type === "Identifier") return imported.name;
  return String(imported.value);
};

/** `import { afterAll as done } from "vitest"`: the package hook a renamed import binds (issue #72). */
const importedHook = (variable: Variable): Option.Option<string> =>
  Option.flatMap(onlyBinding(variable), (definition) => {
    const node = definition.node;
    if (node.type !== "ImportSpecifier") return Option.none();
    const name = importedName(node.imported);
    if (!hookNames.has(name)) return Option.none();
    return Option.as(
      Option.filter(importedFrom(node), (from) => !isProjectModule(from)),
      name,
    );
  });

/** The module a namespace import binds whole: `import * as x`, `import x`, `import { default as x }`, `import x = require()`. */
const namespaceFrom = (node: ESTree.Node): Option.Option<string> => {
  switch (node.type) {
    case "ImportNamespaceSpecifier":
    case "ImportDefaultSpecifier":
      return importedFrom(node);
    case "ImportSpecifier":
      if (importedName(node.imported) !== "default") return Option.none();
      return importedFrom(node);
    case "TSImportEqualsDeclaration": {
      const reference = node.moduleReference;
      if (node.importKind === "type" || reference.type !== "TSExternalModuleReference")
        return Option.none();
      return Option.some(String(reference.expression.value));
    }
    default:
      return Option.none();
  }
};

/** `import * as bt from "bun:test"`, `import m from "mocha"`: a package's namespace (issue #72). */
const isPackageNamespace = (variable: Variable): boolean =>
  Option.exists(onlyBinding(variable), (definition) =>
    Option.exists(namespaceFrom(definition.node), (from) => !isProjectModule(from)),
  );

export const noTestLifecycleHooks = Rule.define({
  name: "no-test-lifecycle-hooks",
  meta: Rule.meta({
    type: "problem",
    description: "Model test fixtures with Effect scopes instead of lifecycle hooks.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    const variableOf = (id: ESTree.Node & { readonly name: string }): Option.Option<Variable> =>
      Scope.findVariableUp(ctx.sourceCode.getScope(id), id.name);

    /** `<runner>.<hook>` on `test`, `it` or `describe`, and `<namespace>.<hook>` on a package's import. */
    const memberHook = (callee: ESTree.MemberExpression): Option.Option<string> =>
      Option.filter(memberName(callee), (name) => {
        if (!hookNames.has(name)) return false;
        const owner = unwrap(callee.object);
        if (owner.type !== "Identifier") return false;
        if (runnerNames.has(owner.name)) return true;
        return Option.exists(variableOf(owner), isPackageNamespace);
      });

    /**
     * The hook a callee calls:
     * - a name spelled like a hook, unless it is one of the three local shapes (`isLocalHook`);
     * - a package's hook imported under another name;
     * - `<runner>.<hook>` and `<namespace>.<hook>` (see `memberHook`).
     */
    const hookOf = (callee: ESTree.Node): Option.Option<string> => {
      const target = unwrap(callee);
      if (target.type === "MemberExpression") return memberHook(target);
      if (target.type !== "Identifier") return Option.none();
      const variable = variableOf(target);
      if (hookNames.has(target.name)) {
        if (Option.exists(variable, isLocalHook)) return Option.none();
        return Option.some(target.name);
      }
      return Option.flatMap(variable, importedHook);
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
