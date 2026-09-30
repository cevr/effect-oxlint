/** Allow dynamic imports only at named lazy-loading boundaries. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { ancestors, parentOf } from "./_ast-ancestors.js";

const identifierName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  return Option.none();
};

const isIdentifierNamed = (node: ESTree.Node, name: string): boolean =>
  Option.contains(identifierName(node), name);

const hasNamedBinding = (pattern: ESTree.BindingPattern): boolean => {
  if (pattern.type === "Identifier") return true;
  if (pattern.type === "ObjectPattern") return pattern.properties.length > 0;
  if (pattern.type === "ArrayPattern") return pattern.elements.some(Predicate.isNotNull);
  return false;
};

const isNamedVariable = (node: ESTree.Node, value: ESTree.Node): boolean =>
  node.type === "VariableDeclarator" && node.init === value && hasNamedBinding(node.id);

const transparentWrappers = new Set([
  "AwaitExpression",
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "YieldExpression",
]);

/** The outermost node reached from `start` through transparent wrapper ancestors. */
const climbTransparent = (start: ESTree.Node): ESTree.Node => {
  let current = start;
  for (const parent of ancestors(start)) {
    if (!transparentWrappers.has(parent.type)) break;
    current = parent;
  }
  return current;
};

const isNamedDirectBinding = (node: ESTree.Node): boolean => {
  const value = climbTransparent(node);
  return Option.exists(parentOf(value), (parent) => isNamedVariable(parent, value));
};

const isNamedFunctionDeclarationBody = (block: ESTree.Node): boolean =>
  block.type === "BlockStatement" &&
  Option.exists(
    parentOf(block),
    (fn) => fn.type === "FunctionDeclaration" && Predicate.isNotNull(fn.id),
  );

const isNamedFunctionBoundary = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  if (parent?.type === "ArrowFunctionExpression" && parent.body === node) {
    return Option.exists(parentOf(parent), (declarator) => isNamedVariable(declarator, parent));
  }
  if (parent?.type !== "ReturnStatement" || parent.argument !== node) return false;
  return Option.exists(parentOf(parent), isNamedFunctionDeclarationBody);
};

const isEffectPromiseCall = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  return (
    isIdentifierNamed(callee.object, "Effect") &&
    Option.exists(identifierName(callee.property), (name) =>
      ["promise", "tryPromise"].includes(name),
    )
  );
};

const isEffectPromiseBoundary = (node: ESTree.Node): boolean => {
  const callback = node.parent;
  if (callback?.type !== "ArrowFunctionExpression" || callback.body !== node) {
    return false;
  }
  return Option.exists(parentOf(callback), isEffectPromiseCall);
};

const isNamedLazyBoundary = (node: ESTree.Node): boolean => {
  return (
    isNamedDirectBinding(node) || isNamedFunctionBoundary(node) || isEffectPromiseBoundary(node)
  );
};

const dynamicRequireMessage = (callee: ESTree.Node): Option.Option<string> => {
  if (isIdentifierNamed(callee, "require")) {
    return Option.some("Avoid require(). Use a static import.");
  }
  if (callee.type !== "MemberExpression") return Option.none();
  if (isIdentifierNamed(callee.object, "module") && isIdentifierNamed(callee.property, "require")) {
    return Option.some("Avoid module.require(). Use a static import.");
  }
  return Option.none();
};

export const noDynamicImports = Rule.define({
  name: "no-dynamic-imports",
  meta: Rule.meta({
    type: "problem",
    description: "Keep dynamic imports behind named lazy-loading boundaries.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const createRequireNames = new Set<string>();
    const requireAliases = new Set<string>();
    const report = (node: ESTree.Node, message: string) =>
      ctx.report(Diagnostic.make({ node, message }));
    return {
      ImportDeclaration: (node) =>
        Option.match(AST.narrow(node, "ImportDeclaration"), {
          onNone: () => Effect.void,
          onSome: (declaration) => {
            if (!["module", "node:module"].includes(AST.importSource(declaration))) {
              return Effect.void;
            }
            for (const specifier of declaration.specifiers) {
              if (
                specifier.type === "ImportSpecifier" &&
                isIdentifierNamed(specifier.imported, "createRequire")
              ) {
                createRequireNames.add(specifier.local.name);
              }
            }
            return Effect.void;
          },
        }),
      VariableDeclarator: (node) =>
        Option.match(AST.narrow(node, "VariableDeclarator"), {
          onNone: () => Effect.void,
          onSome: (declaration) => {
            if (
              declaration.id.type === "Identifier" &&
              declaration.init?.type === "CallExpression" &&
              declaration.init.callee.type === "Identifier" &&
              createRequireNames.has(declaration.init.callee.name)
            ) {
              requireAliases.add(declaration.id.name);
              return report(
                declaration,
                "Avoid createRequire(). Keep module loading static or use a named import() boundary.",
              );
            }
            return Effect.void;
          },
        }),
      ImportExpression: (node) =>
        Option.match(AST.narrow(node, "ImportExpression"), {
          onNone: () => Effect.void,
          onSome: (importExpression) => {
            if (isNamedLazyBoundary(importExpression)) return Effect.void;
            return report(
              node,
              "Avoid inline dynamic imports. Bind the imported module or a lazy loader to a descriptive name before using it.",
            );
          },
        }),
      CallExpression: (node) => {
        return Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: (call) => {
            // `createRequire(import.meta.url)("x")` loads through the bridge without binding it.
            if (
              call.callee.type === "CallExpression" &&
              call.callee.callee.type === "Identifier" &&
              createRequireNames.has(call.callee.callee.name)
            ) {
              return report(call, "Avoid createRequire(). Keep module loading static.");
            }
            const aliasMessage = Option.map(
              Option.filter(identifierName(call.callee), (name) => requireAliases.has(name)),
              () => "Avoid createRequire aliases. Keep module loading static.",
            );
            return Option.match(
              Option.orElse(aliasMessage, () => dynamicRequireMessage(call.callee)),
              {
                onNone: () => Effect.void,
                onSome: (message) => report(call, message),
              },
            );
          },
        });
      },
    };
  },
});
