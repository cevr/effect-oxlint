/** Ban module mocks and method spies in favor of Effect service test layers. */
import type { ESTree, Variable } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

type TestApi = "jest" | "vi";

const bannedMethods = new Set(["mock", "spyOn"]);
const identifierName = (node: ESTree.Node | null | undefined): string | undefined => {
  if (node?.type === "Identifier") return node.name;
  return undefined;
};

const globalTestApi = (name: string): TestApi | undefined => {
  if (name === "jest" || name === "vi") return name;
  return undefined;
};

const importedTestApi = (source: string, imported: string): TestApi | undefined => {
  if (source === "vitest" && imported === "vi") return "vi";
  if (source === "@jest/globals" && imported === "jest") return "jest";
  return undefined;
};

const testApiFromVariable = (
  variable: Variable,
  importedBindings: ReadonlyMap<string, TestApi>,
): TestApi | undefined => {
  if (variable.defs.some((definition) => definition.type === "ImportBinding")) {
    return importedBindings.get(variable.name);
  }
  return undefined;
};

export const noModuleMocks = Rule.define({
  name: "no-module-mocks",
  meta: Rule.meta({
    type: "problem",
    description: "Use Effect service test layers instead of module mocks or method spies.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const importedBindings = new Map<string, TestApi>();

    return {
      ImportDeclaration: (node) =>
        Option.match(AST.narrow(node, "ImportDeclaration"), {
          onNone: () => Effect.void,
          onSome: (declaration) => {
            const source = AST.importSource(declaration);
            for (const specifier of declaration.specifiers) {
              if (specifier.type !== "ImportSpecifier") continue;
              const imported = identifierName(specifier.imported);
              if (imported === undefined) continue;
              const api = importedTestApi(source, imported);
              if (api !== undefined) importedBindings.set(specifier.local.name, api);
            }
            return Effect.void;
          },
        }),
      CallExpression: (node) =>
        Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: (call) => {
            if (call.callee.type !== "MemberExpression") return Effect.void;
            const names = Option.getOrUndefined(AST.memberNames(call.callee));
            if (names === undefined) return Effect.void;
            const [object, method] = names;
            if (!bannedMethods.has(method)) return Effect.void;

            const variable = Option.getOrUndefined(
              Scope.findVariableUp(context.sourceCode.getScope(call), object),
            );
            let api = globalTestApi(object);
            if (variable !== undefined) {
              api = testApiFromVariable(variable, importedBindings);
              if (api === undefined && variable.defs.length === 0) api = globalTestApi(object);
            }
            if (api === undefined) return Effect.void;

            return context.report(
              Diagnostic.make({
                node: call,
                message: `Avoid ${api}.${method}(). Replace the external boundary with an Effect service test Layer.`,
              }),
            );
          },
        }),
    };
  },
});
