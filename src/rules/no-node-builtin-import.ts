/** Ban Node builtin capabilities only when Effect supplies a direct replacement. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

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
  let withoutPrefix = source;
  if (source.startsWith("node:")) withoutPrefix = source.slice(5);
  return Option.getOrElse(Arr.head(withoutPrefix.split("/")), () => withoutPrefix);
};

const importedName = (specifier: ESTree.ImportSpecifier): string => {
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
};

const memberPath = (node: ESTree.MemberExpression): Option.Option<ReadonlyArray<string>> => {
  if (node.computed || node.property.type !== "Identifier") return Option.none();
  const property = node.property.name;
  if (node.object.type === "Identifier") return Option.some([node.object.name, property]);
  if (node.object.type !== "MemberExpression") return Option.none();
  return Option.map(memberPath(node.object), (parentPath) => [...parentPath, property]);
};

/** Whether the segment before the operation in `path` is `name`. */
const followsSegment = (path: ReadonlyArray<string>, name: string): boolean =>
  Option.contains(Arr.get(path, path.length - 2), name);

const isDigestUnder = (operation: string, path: ReadonlyArray<string>, name: string): boolean =>
  operation === "digest" && followsSegment(path, name);

const cryptoReplacement = (operation: string, path: ReadonlyArray<string>): Option.Option<string> => {
  if (cryptoOperations.has(operation) && path.length === 2) return Option.some("Crypto");
  if (followsSegment(path, "webcrypto") && cryptoOperations.has(operation)) {
    return Option.some("Crypto");
  }
  if (isDigestUnder(operation, path, "subtle")) return Option.some("Crypto.digest");
  return Option.none();
};

const replacementFor = (
  module: PartialModule,
  operation: string,
  path: ReadonlyArray<string>,
): Option.Option<string> => {
  if (module === "process") {
    if (processOperations.has(operation) && path.length === 2) {
      return Option.some("Config, Stdio, Clock, or Effect scheduling");
    }
    return Option.none();
  }
  if (module === "subtle") {
    if (operation === "digest" && path.length === 2) return Option.some("Crypto.digest");
    return Option.none();
  }
  if (module === "webcrypto") {
    if (cryptoOperations.has(operation) && path.length === 2) return Option.some("Crypto");
    if (isDigestUnder(operation, path, "subtle")) return Option.some("Crypto.digest");
    return Option.none();
  }
  return cryptoReplacement(operation, path);
};

const partialReplacement = (
  module: PartialModule,
  path: ReadonlyArray<string>,
): Option.Option<string> =>
  Option.flatMap(Arr.last(path), (operation) => replacementFor(module, operation, path));

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
    /** The partially replaced module a member path starts from, if its root is an alias. */
    const aliasedModule = (path: ReadonlyArray<string>): Option.Option<PartialModule> =>
      Option.flatMap(Arr.head(path), (alias) =>
        Option.fromUndefinedOr(partialModuleByAlias.get(alias)),
      );

    return {
      ImportDeclaration: (node) => {
        const narrowed = AST.narrow(node, "ImportDeclaration");
        if (Option.isNone(narrowed)) return Effect.void;
        const declaration = narrowed.value;
        const source = AST.importSource(declaration);
        const module = moduleBase(source);
        const alternative = replacedModules.get(module);
        if (Predicate.isNotUndefined(alternative)) {
          return report(declaration, `importing '${source}'`, alternative);
        }
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
      MemberExpression: (node) =>
        Option.match(AST.narrow(node, "MemberExpression"), {
          onNone: () => Effect.void,
          onSome: (member) => {
            const replacement = Option.flatMap(memberPath(member), (path) =>
              Option.map(
                Option.flatMap(aliasedModule(path), (module) => partialReplacement(module, path)),
                (alternative) => ({ path, alternative }),
              ),
            );
            return Option.match(replacement, {
              onNone: () => Effect.void,
              onSome: ({ path, alternative }) => report(member, `${path.join(".")}`, alternative),
            });
          },
        }),
    };
  },
});
