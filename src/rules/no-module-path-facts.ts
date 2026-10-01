/**
 * Read a module's file path through `Path.fromFileUrl`, not by hand.
 *
 * The runtime path facts `import.meta.dirname`, `import.meta.filename`
 * (Node, Bun) and `import.meta.dir`, `import.meta.path` (Bun) tie the module
 * to one host. Hand-reading the module URL is wrong on its own terms:
 * `new URL("./x.ts", import.meta.url).pathname` keeps percent-escapes
 * (`%20`) and, on Windows, a leading `/C:`. The rule reports:
 *
 * - each read of those four `import.meta` members;
 * - `.pathname` of a `new URL(...)` that takes `import.meta.url` as any
 *   argument, inline or held in a `const` (`const u = new URL(".",
 *   import.meta.url); u.pathname`);
 * - `.slice`, `.substring` and `.replace` read off `import.meta.url`, or off
 *   `.href` of such a URL.
 *
 * `import.meta.url` alone, `import.meta.main`, passing the URL or the URL
 * string to any function, and a `URL` that does not come from the module URL
 * (`new URL("https://x").pathname`) stay allowed.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { constResolver } from "./_const-bindings.js";
import { staticMemberName } from "./_global-values.js";

/** Host path facts on `import.meta`, by the hosts that define them. */
const pathFacts = new Set(["dir", "dirname", "filename", "path"]);

/** String cuts that turn a URL string into a path by hand. */
const stringCuts = new Set(["replace", "slice", "substring"]);

const isImportMeta = (node: ESTree.Node): boolean =>
  node.type === "MetaProperty" && node.meta.name === "import" && node.property.name === "meta";

/** The name of `import.meta.<name>`, when `node` reads a static member of `import.meta`. */
const importMetaMember = (node: ESTree.Node): Option.Option<string> => {
  if (node.type !== "MemberExpression" || !isImportMeta(node.object)) return Option.none();
  return staticMemberName(node);
};

const fix =
  'Use Path.fromFileUrl(new URL("./file.ts", import.meta.url)) from the Effect Path service';

export const noModulePathFacts = Rule.define({
  name: "no-module-path-facts",
  meta: Rule.meta({
    type: "problem",
    description:
      "Read a module's file path with Path.fromFileUrl, not import.meta path facts or a hand-read module URL.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const resolve = constResolver(ctx);

    const isModuleUrlString = (node: ESTree.Expression): boolean =>
      Option.exists(importMetaMember(resolve(node)), (name) => name === "url");

    /** The global `URL`, not a local binding of that name. */
    const isGlobalUrl = (node: ESTree.Node): boolean =>
      node.type === "Identifier" &&
      node.name === "URL" &&
      Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), "URL"), {
        onNone: () => true,
        onSome: (variable) => variable.defs.length === 0,
      });

    /** `new URL(..., import.meta.url)` or `new URL(import.meta.url)`, inline or held in a const. */
    const isModuleUrl = (node: ESTree.Expression): boolean => {
      const value = resolve(node);
      return (
        value.type === "NewExpression" &&
        isGlobalUrl(value.callee) &&
        value.arguments.some(
          (argument) => argument.type !== "SpreadElement" && isModuleUrlString(argument),
        )
      );
    };

    /** `<module URL>.href`: the module URL as a string. */
    const isModuleHref = (node: ESTree.Expression): boolean =>
      node.type === "MemberExpression" &&
      Option.exists(staticMemberName(node), (name) => name === "href") &&
      node.object.type !== "Super" &&
      isModuleUrl(node.object);

    const report = (node: ESTree.Node, used: string) =>
      ctx.report(Diagnostic.make({ node, message: `Avoid ${used}. ${fix}.` }));

    const check = (node: ESTree.MemberExpression): Effect.Effect<void> => {
      const name = staticMemberName(node);
      if (Option.isNone(name)) return Effect.void;
      const member = name.value;
      if (isImportMeta(node.object)) {
        if (pathFacts.has(member)) return report(node, `import.meta.${member}`);
        return Effect.void;
      }
      if (node.object.type === "Super") return Effect.void;
      if (member === "pathname" && isModuleUrl(node.object)) {
        return report(node, "reading .pathname off the module URL");
      }
      if (stringCuts.has(member) && (isModuleUrlString(node.object) || isModuleHref(node.object))) {
        return report(node, `cutting the module URL string with .${member}`);
      }
      return Effect.void;
    };

    return {
      MemberExpression: (node) =>
        Option.match(AST.narrow(node, "MemberExpression"), {
          onNone: () => Effect.void,
          onSome: check,
        }),
    };
  },
});
