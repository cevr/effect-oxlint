/**
 * Ban Node builtin capabilities only when Effect supplies a direct replacement.
 *
 * The `modules` option bans more runtime or platform modules, on top of the
 * built-in list. A key names a module (`"os"` matches `os`, `node:os` and
 * `os/...`); a key ending in `*` matches by prefix (`"bun:*"` matches
 * `bun:sqlite`). `{ "use": "..." }` bans the whole import; adding
 * `"members": [...]` bans only those named imports, and those members read
 * through a default or namespace import. A project exempts its adapter files
 * with an override that turns the rule off, or configures it without the
 * option to keep only the built-in list there.
 */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const ModuleOption = Schema.Struct({
  members: Schema.optionalKey(Schema.Array(Schema.String)),
  use: Schema.String,
});
type ModuleOption = typeof ModuleOption.Type;

const Options = Schema.UndefinedOr(
  Schema.Struct({
    modules: Schema.optionalKey(Schema.Record(Schema.String, ModuleOption)),
  }),
);

const stripNodePrefix = (source: string): string => {
  if (source.startsWith("node:")) return source.slice(5);
  return source;
};

/** Whether a configured module key names `source`. */
const moduleKeyMatches = (key: string, source: string): boolean => {
  const specifier = stripNodePrefix(source);
  if (key.endsWith("*")) return specifier.startsWith(stripNodePrefix(key.slice(0, -1)));
  const name = stripNodePrefix(key);
  return specifier === name || specifier.startsWith(`${name}/`);
};
import * as Predicate from "effect/Predicate";

const replacedModules = new Map([
  ["child_process", "ChildProcessSpawner from 'effect/process'"],
  ["console", "Console or Effect logging"],
  ["fs", "FileSystem"],
  ["http", "HttpClient or HttpServer from 'effect/http'"],
  ["https", "HttpClient or HttpServer from 'effect/http'"],
  ["path", "Path"],
  ["readline", "Terminal or Stdio"],
  ["stream", "Stream, Sink, or Channel"],
  ["timers", "Effect.sleep or Schedule"],
  ["tty", "Terminal or Stdio"],
  ["worker_threads", "Worker from 'effect/workers'"],
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

const cryptoReplacement = (
  operation: string,
  path: ReadonlyArray<string>,
): Option.Option<string> => {
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
    schema: [
      {
        type: "object",
        properties: {
          modules: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                members: { type: "array", items: { type: "string" } },
                use: { type: "string" },
              },
              required: ["use"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ modules: {} }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const partialModuleByAlias = new Map<string, PartialModule>();
    const configuredModules = Object.entries(options?.modules ?? {});
    const configuredByAlias = new Map<string, ModuleOption>();
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

    /** The configured ban a member path hits through a default or namespace alias. */
    const configuredMemberBan = (path: ReadonlyArray<string>): Option.Option<string> => {
      const [alias = "", member = ""] = path;
      if (path.length !== 2) return Option.none();
      return Option.flatMap(Option.fromUndefinedOr(configuredByAlias.get(alias)), (ban) =>
        Option.liftPredicate(ban.use, () => (ban.members ?? []).includes(member)),
      );
    };

    /** Reports an import of a configured module: the whole import, or its listed members. */
    const reportConfigured = (
      declaration: ESTree.ImportDeclaration,
      source: string,
      ban: ModuleOption,
    ): Effect.Effect<void> => {
      if (Predicate.isUndefined(ban.members)) {
        return report(declaration, `importing '${source}'`, ban.use);
      }
      const listed = new Set(ban.members);
      const diagnostics: Array<Effect.Effect<void>> = [];
      for (const specifier of declaration.specifiers) {
        if (specifier.type !== "ImportSpecifier") {
          configuredByAlias.set(specifier.local.name, ban);
          continue;
        }
        const imported = importedName(specifier);
        if (listed.has(imported))
          diagnostics.push(report(specifier, `${source} ${imported}`, ban.use));
      }
      return Effect.all(diagnostics, { discard: true });
    };

    const reportPartial = (
      declaration: ESTree.ImportDeclaration,
      module: "crypto" | "process",
    ): Effect.Effect<void> => {
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
    };

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
        const configured = Option.match(
          Arr.findFirst(configuredModules, ([key]) => moduleKeyMatches(key, source)),
          {
            onNone: () => Effect.void,
            onSome: ([, ban]) => reportConfigured(declaration, source, ban),
          },
        );
        if (module !== "crypto" && module !== "process") return configured;
        return Effect.andThen(configured, reportPartial(declaration, module));
      },
      MemberExpression: (node) =>
        Option.match(AST.narrow(node, "MemberExpression"), {
          onNone: () => Effect.void,
          onSome: (member) => {
            const replacement = Option.flatMap(memberPath(member), (path) =>
              Option.map(
                Option.flatMap(aliasedModule(path), (module) => partialReplacement(module, path)),
                (alternative) => ({ path, alternative }),
              ).pipe(
                Option.orElse(() =>
                  Option.map(configuredMemberBan(path), (alternative) => ({ path, alternative })),
                ),
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
