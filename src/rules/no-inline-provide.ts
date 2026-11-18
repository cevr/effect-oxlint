/**
 * Keep Effect provisioning at explicit composition boundaries.
 *
 * Reported: an `Effect.provide` inside an Effect operation; and, outside test
 * modules, a second `Effect.provide` right after another in one pipe
 * (`program.pipe(Effect.provide(A), Effect.provide(B))`), which builds and
 * provides two layers where one merged layer, provided once, was meant
 * (the effect skill, "one Layer, provided once"; alchemy-domain, "Never chain
 * `Effect.provide`"; catalog SR-E04). Neither is reported in a program's or
 * script's main entry (a module-level `run*(…)` call, or the const it runs):
 * that is the boundary itself.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { isInsideEffectProgram } from "./_effect-context.js";
import { isTestModule } from "./_test-files.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

/** Whether `node` calls `pipe`: `x.pipe(…)` or `pipe(x, …)`. */
const isPipeCall = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type === "Identifier") return node.callee.name === "pipe";
  return (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "pipe"
  );
};

/** The name a call's callee ends in: `run` for `run(…)` and for `BunRuntime.run(…)`. */
const calleeName = (node: ESTree.CallExpression): string => {
  const callee = node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return "";
};

/** The call a module-level statement makes: `run(…)`, `await run(…)`, `void run(…)`. */
const statementCall = (statement: ESTree.Node): Option.Option<ESTree.CallExpression> => {
  if (statement.type !== "ExpressionStatement") return Option.none();
  let expression: ESTree.Expression = statement.expression;
  if (expression.type === "AwaitExpression") expression = expression.argument;
  if (expression.type === "UnaryExpression" && expression.operator === "void") expression = expression.argument;
  if (expression.type !== "CallExpression") return Option.none();
  return Option.some(expression);
};

/** A module-level call that runs a program: its callee's name starts with `run` (runMain, BiteProcess.run, runAndExit). */
const runsProgram = (statement: ESTree.Node): Option.Option<ESTree.CallExpression> =>
  Option.filter(statementCall(statement), (call) => calleeName(call).startsWith("run"));

/**
 * Whether `node` is in a program's or script's main entry: in the
 * arguments of a module-level `run*(…)` call, or in the initializer of a
 * module-level const such a call receives by name (`const main = …;
 * BunRuntime.runMain(main)`). Provision there is the boundary itself.
 */
const inMainEntry = (node: ESTree.Node): boolean => {
  const path = [node, ...ancestors(node)];
  const program = path.at(-1);
  const statement = path.at(-2);
  if (program?.type !== "Program" || !statement) return false;
  if (Option.isSome(runsProgram(statement))) return true;
  if (statement.type !== "VariableDeclaration") return false;
  const declared = new Set(
    statement.declarations.flatMap((declarator) => {
      if (declarator.id.type !== "Identifier") return [];
      return [declarator.id.name];
    }),
  );
  return program.body.some((other) =>
    Option.exists(runsProgram(other), (call) =>
      call.arguments.some((argument) => argument.type === "Identifier" && declared.has(argument.name)),
    ),
  );
};

export const noInlineProvide = Rule.define({
  name: "no-inline-provide",
  meta: Rule.meta({
    type: "problem",
    description: "Keep Effect provisioning outside domain Effect operations, provided once.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const testModule = isTestModule(ctx);

    const isProvide = (node: ESTree.Node, namespaces: ReadonlySet<string>): boolean =>
      node.type === "CallExpression" &&
      node.callee.type !== "Super" &&
      isStaticMember(node.callee, namespaces, "provide");

    /** The second of two adjacent `Effect.provide` steps of a pipe, outside Effect operations. */
    const chainedProvides = (node: ESTree.CallExpression): ReadonlyArray<ESTree.Node> => {
      if (testModule || !isPipeCall(node)) return [];
      const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
      return node.arguments.filter(
        (argument, index) =>
          index > 0 &&
          isProvide(argument, namespaces) &&
          isProvide(node.arguments[index - 1] ?? argument, namespaces) &&
          !isInsideEffectProgram(argument, namespaces) &&
          !inMainEntry(argument),
      );
    };

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const chained = Effect.forEach(
          chainedProvides(node),
          (provide) =>
            ctx.report(
              Diagnostic.make({
                node: provide,
                message:
                  "A second `Effect.provide` right after another builds and provides two layers where one was meant, and hides which service each one feeds. Merge them into one layer drawn from its inputs and outputs (`Layer.provide(Live, Deps)` or `Layer.mergeAll(A, B)`) and provide it once, at the root.",
              }),
            ),
          { discard: true },
        );
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        if (!isStaticMember(node.callee, namespaces, "provide")) return chained;
        if (!isInsideEffectProgram(node, namespaces) || inMainEntry(node)) return chained;
        return Effect.andThen(
          chained,
          ctx.report(
            Diagnostic.make({
              node,
              message:
                "Do not provide dependencies inside an Effect operation. Provide the layer once at the application, handler, command, or test boundary.",
            }),
          ),
        );
      },
    };
  },
});
