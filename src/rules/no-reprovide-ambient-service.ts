/**
 * Ambient Effect dependencies stay in R: do not yield a service from the
 * environment and provide it back with `Effect.provideService`.
 *
 * Reported: `Effect.provideService(..., Service, impl)` whose implementation
 * is a const bound directly to `yield* Service` of the same service. A local
 * provide stays right for a genuinely dynamic implementation (a client built
 * from per-tenant credentials), which is not a yielded service. Ported from
 * K-Mistele/anti-slop (`no-reprovide-ambient-service`, b7c1619, MIT;
 * THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { effectModuleNames, moduleCall, unwrap } from "./_anti-slop-effect.js";

export const noReprovideAmbientService = Rule.define({
  name: "no-reprovide-ambient-service",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow re-providing an Effect service that was yielded directly from the surrounding environment.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const names = effectModuleNames(ctx.sourceCode.ast);

    /** The service a const was bound to by `yield* Service`, when `expression` names such a const. */
    const yieldedService = (expression: ESTree.Node): Option.Option<ESTree.Node> => {
      const value = unwrap(expression);
      if (value.type !== "Identifier") return Option.none();
      return Option.flatMap(
        Scope.findVariableUp(ctx.sourceCode.getScope(value), value.name),
        (variable) => {
          const definition = variable.defs.at(0);
          if (variable.defs.length !== 1 || definition?.node.type !== "VariableDeclarator") {
            return Option.none();
          }
          return Option.flatMap(Option.fromNullishOr(definition.node.init), (init) => {
            const initializer = unwrap(init);
            if (initializer.type !== "YieldExpression" || !initializer.delegate) {
              return Option.none();
            }
            return Option.map(Option.fromNullishOr(initializer.argument), unwrap);
          });
        },
      );
    };

    /** The service an `Effect.provideService` call provides back, when it is the one yielded. */
    const reprovided = (node: ESTree.CallExpression): Option.Option<string> => {
      if (!Option.contains(moduleCall(node, names, "Effect"), "provideService"))
        return Option.none();
      if (node.arguments.length < 2) return Option.none();
      const [service, implementation] = node.arguments.slice(-2);
      if (!service || !implementation) return Option.none();
      if (service.type === "SpreadElement" || implementation.type === "SpreadElement") {
        return Option.none();
      }
      const requested = ctx.sourceCode.getText(unwrap(service));
      return Option.filter(
        Option.map(yieldedService(implementation), (yielded) => ctx.sourceCode.getText(yielded)),
        (yielded) => yielded === requested,
      );
    };

    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(reprovided(node), {
          onNone: () => Effect.void,
          onSome: (service) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `Do not capture "${service}" from the Effect environment and re-provide it with Effect.provideService. Leave "${service}" in the operation's R channel and provide its implementing Layer once at the application runtime composition root. If the runtime has an explicit service union, include "${service}" there; use Layer.provideMerge when the service must remain available after layer construction. A local provide is only appropriate for a genuinely dynamic implementation, such as a client configured from per-tenant credentials.`,
              }),
            ),
        }),
    };
  },
});
