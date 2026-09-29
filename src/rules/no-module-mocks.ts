/** Ban module mocks, mock functions, and method spies in favor of Effect service test layers. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { collectTestBindings, resolveTestBinding, type TestBinding } from "./_test-apis.js";

const mockingMethods = new Set(["doMock", "fn", "mock", "mocked", "spyOn", "unmock"]);

/** bun:test `mock(...)` and `spyOn(...)` are mock doubles in their own right. */
const bannedBareCall = (binding: TestBinding): Option.Option<string> => {
  if (binding === "mock" || binding === "spyOn") return Option.some(`${binding}()`);
  return Option.none();
};

const bannedMemberCall = (binding: TestBinding, method: string): Option.Option<string> => {
  if (binding === "mock") {
    if (method === "module") return Option.some("mock.module()");
    return Option.none();
  }
  if (binding === "spyOn" || !mockingMethods.has(method)) return Option.none();
  return Option.some(`${binding}.${method}()`);
};

export const noModuleMocks = Rule.define({
  name: "no-module-mocks",
  meta: Rule.meta({
    type: "problem",
    description: "Use Effect service test layers instead of module mocks or method spies.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const bindings = new Map<string, TestBinding>();

    const bannedCall = (call: ESTree.CallExpression): Option.Option<string> => {
      const scope = context.sourceCode.getScope(call);
      if (call.callee.type === "Identifier") {
        return Option.flatMap(
          resolveTestBinding(scope, call.callee.name, bindings),
          bannedBareCall,
        );
      }
      if (call.callee.type !== "MemberExpression") return Option.none();
      return Option.flatMap(AST.memberNames(call.callee), ([object, method]) =>
        Option.flatMap(resolveTestBinding(scope, object, bindings), (binding) =>
          bannedMemberCall(binding, method),
        ),
      );
    };

    return {
      ImportDeclaration: (node) => {
        collectTestBindings(node, bindings);
        return Effect.void;
      },
      CallExpression: (node) =>
        Option.match(Option.flatMap(AST.narrow(node, "CallExpression"), bannedCall), {
          onNone: () => Effect.void,
          onSome: (used) =>
            context.report(
              Diagnostic.make({
                node,
                message: `Avoid ${used}. Replace the external boundary with an Effect service test Layer.`,
              }),
            ),
        }),
    };
  },
});
