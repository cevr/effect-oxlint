/**
 * Log one message per `Effect.log*` call and attach data as annotations.
 *
 * `Effect.logWarning("request failed", error)` joins every positional
 * argument into the message text, except a `Cause`, which it lifts out: the
 * error becomes a stringified fragment of the message instead of a field a
 * logger can index, and whether the second argument is data or a cause
 * depends on its runtime type. `Effect.annotateLogs` names each field.
 *
 * Opt-in: variadic messages are documented Effect API, so the rule encodes a
 * structured-logging policy rather than a defect.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const logMethods = ["log", "logDebug", "logError", "logFatal", "logInfo", "logTrace", "logWarning"];

export const noPositionalLogArguments = Rule.define({
  name: "no-positional-log-arguments",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Pass one message to Effect.log* and attach data with Effect.annotateLogs instead of positional arguments.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        if (node.arguments.length < 2 || node.callee.type !== "MemberExpression") {
          return Effect.void;
        }
        const callee = node.callee;
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        return Option.match(
          Arr.findFirst(logMethods, (method) => isStaticMember(callee, effects, method)),
          {
            onNone: () => Effect.void,
            onSome: (method) =>
              ctx.report(
                Diagnostic.make({
                  node,
                  message: `Pass one message to Effect.${method} and attach the rest as named fields: Effect.${method}("message").pipe(Effect.annotateLogs({ error: String(error) })).`,
                }),
              ),
          },
        );
      },
    };
  },
});
