/**
 * Require `forceKillAfter` on every Effect child process command.
 *
 * When the scope that owns a child closes (interruption, a timeout), the
 * platform spawner sends `killSignal` (SIGTERM), waits one second, and then
 * waits for the child to exit with no bound unless the command names
 * `forceKillAfter`. A child that ignores SIGTERM holds its scope open
 * forever. With `forceKillAfter`, the spawner escalates to SIGKILL.
 *
 * The rule reads `make` from `effect/process` (`ChildProcess.make`, and
 * `P.ChildProcess.make` through a namespace import) and from
 * `effect/process/ChildProcess` (a namespace import, or the named `make`
 * under any alias). It reports:
 *
 * - `make("cmd")` and `make("cmd", ["arg"])` with no options;
 * - an options object literal, inline or held in a `const`, that does not
 *   name `forceKillAfter` (in itself or a spread object literal);
 * - the bare template form ``make`cmd` ``, which cannot carry options: write
 *   ``make({ forceKillAfter: "5 seconds" })`cmd` `` instead.
 *
 * Options the rule cannot see (a parameter, a call result, a spread of one)
 * are left alone.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { expressionArgument, staticProperties } from "./_call-arguments.js";
import { constResolver } from "./_const-bindings.js";
import { staticMemberName } from "./_global-values.js";

const processModule = "effect/process";
const childProcessModule = "effect/process/ChildProcess";

/** The exported name an import specifier reads: `make` in `{ make as cmd }` or `{ "make" as cmd }`. */
const importedName = (specifier: ESTree.ImportSpecifier): string => {
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
};

/** What an options argument tells the rule. */
type Options = "named" | "missing" | "unknown";

const message =
  'ChildProcess.make without forceKillAfter: on interrupt or timeout the spawner sends SIGTERM, waits 1 s, then waits for exit with no bound, so a child that ignores SIGTERM holds its scope open forever. Name forceKillAfter in the command options, such as `forceKillAfter: "5 seconds"`.';

const templateMessage =
  'The template form of ChildProcess.make cannot carry forceKillAfter. Write make({ forceKillAfter: "5 seconds" })`cmd` so a child that ignores SIGTERM cannot hold its scope open forever.';

export const requireForceKillAfter = Rule.define({
  name: "require-force-kill-after",
  meta: Rule.meta({
    type: "problem",
    description:
      "Name forceKillAfter on every ChildProcess.make command so a child that ignores SIGTERM cannot hold its scope open.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const resolve = constResolver(ctx);
    /** Locals holding the `effect/process` barrel: `import * as P from "effect/process"`. */
    const processNamespaces = new Set<string>();
    /** Locals holding the ChildProcess module. */
    const childProcessNamespaces = new Set<string>();
    /** Locals holding `make` itself. */
    const makeFunctions = new Set<string>();

    /** An identifier that still reads its import, not a local binding of the same name. */
    const readsImport = (
      node: ESTree.Node & { readonly name: string },
      names: ReadonlySet<string>,
    ): boolean =>
      names.has(node.name) &&
      Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name), {
        onNone: () => false,
        onSome: (variable) =>
          variable.defs.some((definition) => definition.type === "ImportBinding"),
      });

    const isMember = (node: ESTree.Node, name: string): node is ESTree.MemberExpression =>
      node.type === "MemberExpression" &&
      Option.exists(staticMemberName(node), (property) => property === name);

    /** `ChildProcess` read off the module: a namespace local, or `P.ChildProcess`. */
    const isChildProcessModule = (node: ESTree.Node): boolean => {
      if (node.type === "Identifier") return readsImport(node, childProcessNamespaces);
      return (
        isMember(node, "ChildProcess") &&
        node.object.type === "Identifier" &&
        readsImport(node.object, processNamespaces)
      );
    };

    const isMake = (node: ESTree.Node): boolean => {
      if (node.type === "Identifier") return readsImport(node, makeFunctions);
      return isMember(node, "make") && isChildProcessModule(node.object);
    };

    /** Whether an options expression names `forceKillAfter`, lacks it, or cannot be read. */
    const optionsOf = (expression: ESTree.Expression): Options => {
      const value = resolve(expression);
      if (value.type !== "ObjectExpression") return "unknown";
      if (staticProperties(value, "forceKillAfter").length > 0) return "named";
      let found: Options = "missing";
      for (const property of value.properties) {
        if (property.type !== "SpreadElement") continue;
        const spread = optionsOf(property.argument);
        if (spread === "named") return "named";
        if (spread === "unknown") found = "unknown";
      }
      return found;
    };

    /**
     * The options of `make(...)`: the first argument of the options-then-template
     * form, else the argument after the command and its argument array.
     */
    const callOptions = (node: ESTree.CallExpression): Options => {
      const first = expressionArgument(node, 0);
      if (Option.isNone(first)) return "unknown";
      const firstValue = resolve(first.value);
      const isTag = node.parent?.type === "TaggedTemplateExpression" && node.parent.tag === node;
      if (isTag || firstValue.type === "ObjectExpression") return optionsOf(first.value);
      if (node.arguments.some((argument) => argument.type === "SpreadElement")) return "unknown";
      const second = expressionArgument(node, 1);
      if (Option.isNone(second)) return "missing";
      const secondValue = resolve(second.value);
      if (secondValue.type === "ObjectExpression") return optionsOf(second.value);
      const third = expressionArgument(node, 2);
      if (Option.isSome(third)) return optionsOf(third.value);
      // `make(cmd, args)`: an array, or a value that may be the options.
      if (secondValue.type === "ArrayExpression") return "missing";
      return "unknown";
    };

    const report = (node: ESTree.Node, text: string) =>
      ctx.report(Diagnostic.make({ node, message: text }));

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        const source = node.source.value;
        if (source !== processModule && source !== childProcessModule) return Effect.void;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            if (source === processModule) processNamespaces.add(specifier.local.name);
            else childProcessNamespaces.add(specifier.local.name);
            continue;
          }
          if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;
          const imported = importedName(specifier);
          if (source === processModule && imported === "ChildProcess") {
            childProcessNamespaces.add(specifier.local.name);
          }
          if (source === childProcessModule && imported === "make") {
            makeFunctions.add(specifier.local.name);
          }
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        if (node.callee.type === "Super" || !isMake(node.callee)) return Effect.void;
        if (callOptions(node) !== "missing") return Effect.void;
        return report(node, message);
      },
      TaggedTemplateExpression: (node: ESTree.TaggedTemplateExpression) => {
        if (!isMake(node.tag)) return Effect.void;
        return report(node, templateMessage);
      },
    };
  },
});
