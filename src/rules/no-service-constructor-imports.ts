/**
 * Dependency-bearing service constructors stay in the module that owns the
 * capability. Opt-in: a project that names its service constructors
 * `make<Capability>` enables it.
 *
 * Reported: a named import of `make<Capital>…` from a project-local module
 * (`./`, `../`) outside test code. Ported from K-Mistele/anti-slop
 * (`no-service-constructor-imports`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";

const serviceConstructorName = /^make[A-Z]/u;

const isProjectLocalImport = (source: string): boolean =>
  source.startsWith("./") || source.startsWith("../");

const importedName = (specifier: ESTree.ImportSpecifier): string => {
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
};

export const noServiceConstructorImports = Rule.define({
  name: "no-service-constructor-imports",
  meta: Rule.meta({
    type: "problem",
    description: "Disallow project-local make<Capability> imports outside test and spec files.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        if (!isProjectLocalImport(node.source.value)) return Effect.void;
        return Effect.forEach(
          node.specifiers.filter(
            (specifier): specifier is ESTree.ImportSpecifier =>
              specifier.type === "ImportSpecifier" &&
              serviceConstructorName.test(importedName(specifier)),
          ),
          (specifier) =>
            ctx.report(
              Diagnostic.make({
                node: specifier,
                message: `Runtime code imports the service constructor "${importedName(specifier)}", which builds the service by hand and hides its requirements. Import the owning Layer, \`yield*\` the service where it is used, and let its requirements propagate to the composition root.`,
              }),
            ),
          { discard: true },
        );
      },
    };
  },
});
