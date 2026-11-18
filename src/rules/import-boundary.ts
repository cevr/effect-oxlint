/**
 * Imports respect the project's layout: an import-boundary rule configured
 * by path.
 *
 * Each entry of `boundaries` names the files it covers (`files`, globs
 * relative to the lint root) and either `deny` (specifiers they may not
 * import) or `allowOnly` (the only specifiers they may import), with an
 * optional `reason` for the message. A specifier pattern is a glob matched
 * against a bare specifier (`pg`, `@aws-sdk/*`) or, for a relative import,
 * against the imported path resolved from the lint root
 * (`src/orders/aggregate/**`). Checked: `import … from`, `export … from` and
 * `import(…)` with a string. Test modules are skipped. One rule covers the
 * domain files that import no vendor or adapter (catalog SR-E11), contexts
 * that never import each other's aggregates (SR-D07) and a domain package
 * that imports only `effect` and the domain library (SR-D08):
 *
 * ```json
 * { "boundaries": [
 *   { "files": ["src/notes/*.ts"], "deny": ["pg", "src/notes/postgres/**"], "reason": "domain files import no vendor or adapter" },
 *   { "files": ["packages/domain/**"], "allowOnly": ["effect", "effect/**", "@alchemy.run/domain", "packages/domain/**"] }
 * ] }
 * ```
 *
 * Source: the effect skill `ARCHITECTURE.md` "Fence the layout"; the
 * alchemy-domain skill's layout and conventions.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { globMatches, isTestModule, lintRootPath, skipFile } from "./_test-files.js";

const Boundary = Schema.Struct({
  files: Schema.Array(Schema.String),
  deny: Schema.optionalKey(Schema.Array(Schema.String)),
  allowOnly: Schema.optionalKey(Schema.Array(Schema.String)),
  reason: Schema.optionalKey(Schema.String),
});
type Boundary = typeof Boundary.Type;

const Options = Schema.UndefinedOr(
  Schema.Struct({ boundaries: Schema.optionalKey(Schema.Array(Boundary)) }),
);

/** `a/b/c.ts` + `../d` → `a/d`: a relative specifier as a lint-root path. */
const resolveRelative = (file: string, specifier: string): string => {
  const parts = file.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
};

/** The text a specifier pattern is matched against. */
const importTarget = (file: string, specifier: string): string => {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveRelative(file, specifier);
  }
  return specifier;
};

/** The boundary an import crosses, if any. */
const crossed = (
  boundaries: ReadonlyArray<Boundary>,
  file: string,
  target: string,
): Option.Option<Boundary> =>
  Option.fromNullishOr(
    boundaries.find((boundary) => {
      if (!boundary.files.some((glob) => globMatches(glob, file))) return false;
      const denied = (boundary.deny ?? []).some((glob) => globMatches(glob, target));
      const outside = Option.exists(
        Option.fromNullishOr(boundary.allowOnly),
        (allowed) => !allowed.some((glob) => globMatches(glob, target)),
      );
      return denied || outside;
    }),
  );

const literalSource = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Literal" && Predicate.isString(node.value)) return Option.some(node.value);
  return Option.none();
};

export const importBoundary = Rule.define({
  name: "import-boundary",
  meta: Rule.meta({
    type: "problem",
    description: "Keep imports inside the boundaries the project configures by path.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          boundaries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                files: { type: "array", items: { type: "string" } },
                deny: { type: "array", items: { type: "string" } },
                allowOnly: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
              },
              required: ["files"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ boundaries: [] }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const boundaries = options?.boundaries ?? [];
    if (boundaries.length === 0 || isTestModule(ctx)) return skipFile;
    const file = lintRootPath(ctx);

    const check = (node: ESTree.Node, source: Option.Option<string>) =>
      Option.match(
        Option.flatMap(source, (specifier) =>
          Option.map(crossed(boundaries, file, importTarget(file, specifier)), (boundary) => ({
            specifier,
            boundary,
          })),
        ),
        {
          onNone: () => Effect.void,
          onSome: ({ specifier, boundary }) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${specifier}\` is outside what ${boundary.files.join(", ")} may import${Option.match(Option.fromNullishOr(boundary.reason), { onNone: () => "", onSome: (reason) => ` (${reason})` })}, so this file now depends on a layer it should not know. Reach it through the contract this folder owns (a service or operation type it declares), and let the composition root bind the implementation.`,
              }),
            ),
        },
      );

    const fromSource = (
      node: ESTree.ImportDeclaration | ESTree.ExportNamedDeclaration | ESTree.ExportAllDeclaration,
    ) =>
      Option.flatMap(Option.fromNullishOr(node.source), literalSource);

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => check(node, fromSource(node)),
      ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) =>
        check(node, fromSource(node)),
      ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) => check(node, fromSource(node)),
      ImportExpression: (node: ESTree.ImportExpression) => check(node, literalSource(node.source)),
    };
  },
});
