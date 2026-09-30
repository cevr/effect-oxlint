/**
 * Keep Promise edges in the boundary modules a project names.
 *
 * `Effect.runPromise` and its variants, and `runPromise` on a runtime value
 * (`runtime`, `clientRuntime`, any name ending in `Runtime`), turn an Effect
 * into a Promise: past that point failures leave the typed error channel and
 * interruption stops propagating. A project keeps those edges in named
 * boundary files and turns this rule off there with an override:
 *
 * ```json
 * { "overrides": [{ "files": ["**\/*-boundary.ts"], "rules": { "effect/noRunPromise": "off" } }] }
 * ```
 *
 * `runSync` and `runFork` are not Promise edges and are not reported. Test
 * modules are `noEffectRunInTests`'s to report.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";
import { isTestModule, skipFile } from "./_test-files.js";

const promiseRunners = ["runPromise", "runPromiseExit", "runPromiseExitWith", "runPromiseWith"];

/** The rightmost name of a runtime receiver: `runtime`, or `ui.clientRuntime` → `clientRuntime`. */
const receiverName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return Option.some(node.property.name);
  }
  return Option.none();
};

const isRuntimeName = (name: string): boolean => name === "runtime" || name.endsWith("Runtime");

export const noRunPromise = Rule.define({
  name: "no-run-promise",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Keep Effect.runPromise and runtime runPromise calls in the boundary modules an override exempts.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const effectNamespaces = new Set(["Effect"]);

    const report = (node: ESTree.Node, edge: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `${edge} turns an Effect into a Promise. Keep Promise edges in a named boundary module, where an override turns this rule off.`,
        }),
      );

    const edgeName = (node: ESTree.MemberExpression): Option.Option<string> => {
      const effects = visibleNamespaces(ctx, node, effectNamespaces);
      const runner = Arr.findFirst(promiseRunners, (name) => isStaticMember(node, effects, name));
      if (Option.isSome(runner)) return Option.some(`Effect.${runner.value}`);
      if (
        node.computed ||
        node.property.type !== "Identifier" ||
        !promiseRunners.includes(node.property.name) ||
        node.parent?.type !== "CallExpression" ||
        node.parent.callee !== node
      ) {
        return Option.none();
      }
      const method = node.property.name;
      return receiverName(node.object).pipe(
        Option.filter(isRuntimeName),
        Option.map((runtime) => `${runtime}.${method}`),
      );
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      MemberExpression: (node: ESTree.MemberExpression) =>
        Option.match(edgeName(node), {
          onNone: () => Effect.void,
          onSome: (edge) => report(node, edge),
        }),
    };
  },
});
