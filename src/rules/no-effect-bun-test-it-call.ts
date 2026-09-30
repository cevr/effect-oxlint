/**
 * Ban calling `it` from effect-bun-test.
 *
 * effect-bun-test's `it` is an object holding the runners (`it.effect`,
 * `it.scoped`, `it.live`, `it.scopedLive`), not a function.
 * Calling it throws a TypeError while the module loads, so the runner
 * registers none of the file's tests and reports the loss as an error
 * attributed to no test: every assertion in the file looks like it passed.
 *
 * The call is reported through any local name the import gives `it`, and as
 * `ns.it(...)` through a namespace import. `it` from another runner, such as
 * bun:test or @effect/vitest, is callable and untouched.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";

const packageName = "effect-bun-test";

export const noEffectBunTestItCall = Rule.define({
  name: "no-effect-bun-test-it-call",
  meta: Rule.meta({
    type: "problem",
    description:
      "Ban calling effect-bun-test's `it`: it is an object of runners, and the call throws while the module loads.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const itNames = new Set<string>();
    const namespaces = new Set<string>();

    /** Whether `name` at `node` still refers to the import that bound it. */
    const isImportBinding = (node: ESTree.Node, name: string): boolean =>
      Option.exists(Scope.findVariableUp(ctx.sourceCode.getScope(node), name), (variable) =>
        variable.defs.some((definition) => definition.type === "ImportBinding"),
      );

    const calledName = (callee: ESTree.Node): Option.Option<string> => {
      if (callee.type === "Identifier" && itNames.has(callee.name)) {
        return Option.some(callee.name).pipe(
          Option.filter((name) => isImportBinding(callee, name)),
        );
      }
      if (
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.object.type !== "Identifier" ||
        !namespaces.has(callee.object.name) ||
        callee.property.type !== "Identifier" ||
        callee.property.name !== "it" ||
        !isImportBinding(callee, callee.object.name)
      ) {
        return Option.none();
      }
      return Option.some(`${callee.object.name}.it`);
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        if (node.source.value !== packageName) return Effect.void;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
          if (
            specifier.type === "ImportSpecifier" &&
            ((specifier.imported.type === "Identifier" && specifier.imported.name === "it") ||
              (specifier.imported.type === "Literal" && specifier.imported.value === "it"))
          ) {
            itNames.add(specifier.local.name);
          }
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(calledName(node.callee), {
          onNone: () => Effect.void,
          onSome: (name) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${name}(...)\` from effect-bun-test is not callable: it is the object holding \`${name}.effect\`, \`${name}.scoped\`, \`${name}.live\`, and \`${name}.scopedLive\`. The call throws while the module loads, so none of this file's tests register. Use one of those runners, or \`test(...)\` from bun:test for a synchronous body.`,
              }),
            ),
        }),
    };
  },
});
