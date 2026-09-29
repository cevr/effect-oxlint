/** Ban module mocks and method spies in favor of Effect service test layers. */
import type { ESTree, Variable } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

type TestApi = "jest" | "vi";

const bannedMethods = new Set(["mock", "spyOn"]);
const identifierName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  return Option.none();
};

const globalTestApi = (name: string): Option.Option<TestApi> => {
  if (name === "jest" || name === "vi") return Option.some(name);
  return Option.none();
};

const importedTestApi = (source: string, imported: string): Option.Option<TestApi> => {
  if (source === "vitest" && imported === "vi") return Option.some("vi");
  if (source === "@jest/globals" && imported === "jest") return Option.some("jest");
  return Option.none();
};

const testApiFromVariable = (
  variable: Variable,
  importedBindings: ReadonlyMap<string, TestApi>,
): Option.Option<TestApi> => {
  if (variable.defs.some((definition) => definition.type === "ImportBinding")) {
    return Option.fromUndefinedOr(importedBindings.get(variable.name));
  }
  return Option.none();
};

/** The test API an `object` names: an imported binding, or the unshadowed global. */
const resolveTestApi = (
  binding: Option.Option<Variable>,
  object: string,
  importedBindings: ReadonlyMap<string, TestApi>,
): Option.Option<TestApi> =>
  Option.match(binding, {
    onNone: () => globalTestApi(object),
    onSome: (variable) =>
      Option.orElse(testApiFromVariable(variable, importedBindings), () =>
        Option.filter(globalTestApi(object), () => variable.defs.length === 0),
      ),
  });

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
              const api = Option.flatMap(identifierName(specifier.imported), (imported) =>
                importedTestApi(source, imported),
              );
              if (Option.isSome(api)) importedBindings.set(specifier.local.name, api.value);
            }
            return Effect.void;
          },
        }),
      CallExpression: (node) =>
        Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: (call) => {
            if (call.callee.type !== "MemberExpression") return Effect.void;
            const names = Option.filter(AST.memberNames(call.callee), ([, method]) =>
              bannedMethods.has(method),
            );
            if (Option.isNone(names)) return Effect.void;
            const [object, method] = names.value;

            const variable = Scope.findVariableUp(context.sourceCode.getScope(call), object);
            const api = resolveTestApi(variable, object, importedBindings);
            if (Option.isNone(api)) return Effect.void;

            return context.report(
              Diagnostic.make({
                node: call,
                message: `Avoid ${api.value}.${method}(). Replace the external boundary with an Effect service test Layer.`,
              }),
            );
          },
        }),
    };
  },
});
