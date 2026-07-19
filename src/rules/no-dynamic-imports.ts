/** Allow dynamic imports only at named lazy-loading boundaries. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const identifierName = (node: ESTree.Node | null | undefined): string | undefined =>
  node?.type === "Identifier" ? node.name : undefined;

const isNamedVariable = (node: ESTree.Node, value: ESTree.Node): boolean =>
  node.type === "VariableDeclarator" && node.init === value && node.id.type === "Identifier";

const transparentWrappers = new Set([
  "AwaitExpression",
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "YieldExpression",
]);

const climbTransparent = (start: ESTree.Node): ESTree.Node => {
  let current = start;
  while (current.parent != null && transparentWrappers.has(current.parent.type)) {
    current = current.parent;
  }
  return current;
};

const isNamedDirectBinding = (node: ESTree.Node): boolean => {
  const value = climbTransparent(node);
  return value.parent != null && isNamedVariable(value.parent, value);
};

const isNamedFunctionBoundary = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  if (parent?.type === "ArrowFunctionExpression" && parent.body === node) {
    return parent.parent !== undefined && isNamedVariable(parent.parent, parent);
  }
  if (parent?.type !== "ReturnStatement" || parent.argument !== node) return false;
  const block = parent.parent;
  const fn = block?.parent;
  return block?.type === "BlockStatement" && fn?.type === "FunctionDeclaration" && fn.id !== null;
};

const isEffectPromiseCall = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  return (
    identifierName(callee.object) === "Effect" &&
    ["promise", "tryPromise"].includes(identifierName(callee.property) ?? "")
  );
};

const isNamedEffectBoundary = (node: ESTree.Node): boolean => {
  const callback = node.parent;
  if (callback?.type !== "ArrowFunctionExpression" || callback.body !== node) {
    return false;
  }
  const call = callback.parent;
  if (call === undefined || !isEffectPromiseCall(call)) return false;
  const value = climbTransparent(call);
  return value.parent != null && isNamedVariable(value.parent, value);
};

const isNamedLazyBoundary = (node: ESTree.Node): boolean => {
  return isNamedDirectBinding(node) || isNamedFunctionBoundary(node) || isNamedEffectBoundary(node);
};

const dynamicRequireMessage = (callee: ESTree.Node): string | undefined => {
  if (identifierName(callee) === "require") return "Avoid require(). Use a static import.";
  if (callee?.type !== "MemberExpression") return undefined;
  return identifierName(callee.object) === "module" && identifierName(callee.property) === "require"
    ? "Avoid module.require(). Use a static import."
    : undefined;
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
                identifierName(specifier.imported) === "createRequire"
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
          onSome: (importExpression) =>
            isNamedLazyBoundary(importExpression)
              ? Effect.void
              : ctx.report(
                  Diagnostic.make({
                    node,
                    message:
                      "Avoid inline dynamic imports. Bind the imported module or a lazy loader to a descriptive name before using it.",
                  }),
                ),
        }),
      CallExpression: (node) => {
        return Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: (call) => {
            const calleeName = identifierName(call.callee);
            const message =
              calleeName !== undefined && requireAliases.has(calleeName)
                ? "Avoid createRequire aliases. Keep module loading static."
                : dynamicRequireMessage(call.callee);
            return message === undefined
              ? Effect.void
              : ctx.report(Diagnostic.make({ node: call, message }));
          },
        });
      },
    };
  },
});
