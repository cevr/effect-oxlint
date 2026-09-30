/** Keep request-shared state out of module-level `let` and `var` bindings. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { isTestModule, skipFile } from "./_test-files.js";

/** Nodes that start a new `var` scope, so a `var` below them is not module state. */
const functionScopeBoundaries = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "StaticBlock",
  "TSDeclareFunction",
  "TSModuleBlock",
]);

const isModuleScopedVar = (node: ESTree.VariableDeclaration): boolean =>
  Option.exists(
    Arr.findFirst(
      ancestors(node),
      (ancestor) => ancestor.type === "Program" || functionScopeBoundaries.has(ancestor.type),
    ),
    (boundary) => boundary.type === "Program",
  );

export const noModuleLevelMutableState = Rule.define({
  name: "no-module-level-mutable-state",
  meta: Rule.meta({
    type: "problem",
    description: "Keep state out of module-level let and var bindings.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;

    const isModuleScoped = (node: ESTree.VariableDeclaration): boolean => {
      if (node.kind === "var") return isModuleScopedVar(node);
      const scope = ctx.sourceCode.getScope(node);
      return scope.type === "module" || scope.type === "global";
    };

    return {
      VariableDeclaration: (node: ESTree.VariableDeclaration) => {
        if (node.declare === true) return Effect.void;
        if (node.kind !== "let" && node.kind !== "var") return Effect.void;
        if (!isModuleScoped(node)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Module-level ${node.kind} is shared by every request a server process or Worker isolate handles. Keep the state in a Ref built by a Layer, or in the service that owns it.`,
          }),
        );
      },
    };
  },
});
