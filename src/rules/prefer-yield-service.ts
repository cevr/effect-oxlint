/**
 * Yield each service an operation uses; do not capture the whole context to
 * provide it back.
 *
 * Reported: `const context = yield* Effect.context()` whose binding is passed
 * to `Effect.provide`, `Effect.provideContext`, `Layer.provide` or
 * `Layer.succeedContext`. Ported from K-Mistele/anti-slop
 * (`prefer-yield-service`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { effectModuleNames, moduleCall, unwrap } from "./_anti-slop-effect.js";
import type { EffectModuleNames } from "./_anti-slop-effect.js";

const effectProvides: ReadonlySet<string> = new Set(["provide", "provideContext"]);
const layerProvides: ReadonlySet<string> = new Set(["provide", "succeedContext"]);

/** The providing call `identifier` is an argument of, through parentheses and type assertions. */
const providingCall = (
  identifier: ESTree.Node,
  names: EffectModuleNames,
): Option.Option<ESTree.CallExpression> => {
  let child: ESTree.Node = identifier;
  let parent = identifier.parent;
  while (parent && unwrap(parent) !== parent) {
    child = parent;
    parent = parent.parent;
  }
  if (parent?.type !== "CallExpression") return Option.none();
  if (!parent.arguments.some((argument) => argument === child)) return Option.none();
  const provides =
    Option.exists(moduleCall(parent, names, "Effect"), (name) => effectProvides.has(name)) ||
    Option.exists(moduleCall(parent, names, "Layer"), (name) => layerProvides.has(name));
  return Option.liftPredicate(parent, () => provides);
};

/** Whether a declarator binds a name to `yield* Effect.context()`. */
const capturesContext = (node: ESTree.VariableDeclarator, names: EffectModuleNames): boolean => {
  if (node.id.type !== "Identifier") return false;
  return Option.exists(Option.fromNullishOr(node.init), (init) => {
    const value = unwrap(init);
    return (
      value.type === "YieldExpression" &&
      value.delegate &&
      Option.exists(Option.fromNullishOr(value.argument), (argument) =>
        Option.contains(moduleCall(argument, names, "Effect"), "context"),
      )
    );
  });
};

export const preferYieldService = Rule.define({
  name: "prefer-yield-service",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow `yield* Effect.context()` results that are passed back to Effect.provide, Effect.provideContext, Layer.provide or Layer.succeedContext.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const names = effectModuleNames(ctx.sourceCode.ast);

    return {
      VariableDeclarator: (node: ESTree.VariableDeclarator) => {
        if (!capturesContext(node, names)) return Effect.void;
        const call = ctx.sourceCode
          .getDeclaredVariables(node)
          .flatMap((variable) => variable.references)
          .map((reference) => providingCall(reference.identifier, names))
          .find(Option.isSome);
        return Option.match(Option.flatten(Option.fromUndefinedOr(call)), {
          onNone: () => Effect.void,
          onSome: (provide) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `Do not capture the context with \`Effect.context\` and provide it back with ${ctx.sourceCode.getText(unwrap(provide.callee))}. \`yield*\` each service the operation uses (\`const store = yield* Store\`) and let the nested effect's requirements flow through its R channel to the layer or runtime that provides them.`,
              }),
            ),
        });
      },
    };
  },
});
