/** Ban Node builtin capabilities only when Effect supplies a direct replacement. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const replacedModules = new Map([
  ["child_process", "ChildProcessSpawner from 'effect/unstable/process'"],
  ["console", "Console or Effect logging"],
  ["fs", "FileSystem"],
  ["http", "HttpClient or HttpServer from 'effect/unstable/http'"],
  ["https", "HttpClient or HttpServer from 'effect/unstable/http'"],
  ["path", "Path"],
  ["readline", "Terminal or Stdio"],
  ["stream", "Stream, Sink, or Channel"],
  ["timers", "Effect.sleep or Schedule"],
  ["tty", "Terminal or Stdio"],
  ["worker_threads", "Worker from 'effect/unstable/workers'"],
]);

const cryptoOperations = new Set([
  "getRandomValues",
  "randomBytes",
  "randomFill",
  "randomFillSync",
  "randomInt",
  "randomUUID",
]);

const processOperations = new Set([
  "argv",
  "chdir",
  "env",
  "exit",
  "hrtime",
  "nextTick",
  "stderr",
  "stdin",
  "stdout",
]);

type PartialModule = "crypto" | "process" | "subtle" | "webcrypto";

const moduleBase = (source: string): string => {
  const withoutPrefix = source.startsWith("node:") ? source.slice(5) : source;
  return withoutPrefix.split("/")[0] ?? withoutPrefix;
};

const importedName = (specifier: ESTree.ImportSpecifier): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;

const memberPath = (node: ESTree.MemberExpression): ReadonlyArray<string> | undefined => {
  if (node.computed || node.property.type !== "Identifier") return undefined;
  if (node.object.type === "Identifier") return [node.object.name, node.property.name];
  if (node.object.type !== "MemberExpression") return undefined;
  const parentPath = memberPath(node.object);
  return parentPath === undefined ? undefined : [...parentPath, node.property.name];
};

const partialReplacement = (
  module: PartialModule,
  path: ReadonlyArray<string>,
): string | undefined => {
  const operation = path.at(-1);
  if (operation === undefined) return undefined;

  if (module === "process") {
    return processOperations.has(operation) && path.length === 2
      ? "Config, Stdio, Clock, or Effect scheduling"
      : undefined;
  }
  if (module === "subtle") {
    return operation === "digest" && path.length === 2 ? "Crypto.digest" : undefined;
  }
  if (module === "webcrypto") {
    if (cryptoOperations.has(operation) && path.length === 2) return "Crypto";
    return operation === "digest" && path.at(-2) === "subtle" ? "Crypto.digest" : undefined;
  }
  if (cryptoOperations.has(operation) && path.length === 2) return "Crypto";
  if (path.at(-2) === "webcrypto" && cryptoOperations.has(operation)) return "Crypto";
  return operation === "digest" && path.at(-2) === "subtle" ? "Crypto.digest" : undefined;
};

export const noNodeBuiltinImport = Rule.define({
  name: "no-node-builtin-import",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid Node builtin capabilities that Effect replaces.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const partialModuleByAlias = new Map<string, PartialModule>();
    const report = (node: ESTree.Node, used: string, alternative: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Avoid ${used}. Use ${alternative}; platform adapters may disable this rule explicitly.`,
        }),
      );

    return {
      ImportDeclaration: (node) => {
        const declaration = Option.getOrUndefined(AST.narrow(node, "ImportDeclaration"));
        if (declaration === undefined) return Effect.void;
        const source = AST.importSource(declaration);
        const module = moduleBase(source);
        const alternative = replacedModules.get(module);
        if (alternative !== undefined)
          return report(declaration, `importing '${source}'`, alternative);
        if (module !== "crypto" && module !== "process") return Effect.void;

        const diagnostics: Array<Effect.Effect<void>> = [];
        for (const specifier of declaration.specifiers) {
          if (
            specifier.type === "ImportDefaultSpecifier" ||
            specifier.type === "ImportNamespaceSpecifier"
          ) {
            partialModuleByAlias.set(specifier.local.name, module);
            continue;
          }
          const imported = importedName(specifier);
          if (module === "crypto") {
            if (imported === "webcrypto" || imported === "subtle") {
              partialModuleByAlias.set(specifier.local.name, imported);
            } else if (cryptoOperations.has(imported)) {
              diagnostics.push(report(specifier, `node:crypto ${imported}`, "Crypto"));
            }
          } else if (processOperations.has(imported)) {
            diagnostics.push(
              report(
                specifier,
                `node:process ${imported}`,
                "Config, Stdio, Clock, or Effect scheduling",
              ),
            );
          }
        }
        return Effect.all(diagnostics, { discard: true });
      },
      MemberExpression: (node) => {
        const member = Option.getOrUndefined(AST.narrow(node, "MemberExpression"));
        if (member === undefined) return Effect.void;
        const path = memberPath(member);
        if (path === undefined) return Effect.void;
        const alias = path[0];
        if (alias === undefined) return Effect.void;
        const module = partialModuleByAlias.get(alias);
        if (module === undefined) return Effect.void;
        const alternative = partialReplacement(module, path);
        return alternative === undefined
          ? Effect.void
          : report(member, `${path.join(".")}`, alternative);
      },
    };
  },
});
