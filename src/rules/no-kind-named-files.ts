/**
 * Files and folders are named by concept, not by kind.
 *
 * Reported, once per file at its first line: a path (relative to the lint
 * root) with a folder named `services`, `utils`, `utilities` or `helpers`,
 * or a file named `*.service.ts`, `*-service.ts`, `*_service.ts`, `utils.ts`,
 * `*.utils.ts`, `helpers.ts` or `*.helpers.ts` (any JS or TS extension).
 * Files matching an `allow` glob are left alone; test modules are skipped.
 * A ban: a project adopts it with a baseline that only shrinks. Source: the
 * effect skill `ARCHITECTURE.md` braid "Files named by kind… or folders by
 * kind" (catalog SR-E12).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js";
import { Baseline, baselineJsonSchema, withBaseline } from "./_baseline.js";
import { isTestModule, lintRootPath, matchesFileGlobs, skipFile } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    allow: Schema.optionalKey(Schema.Array(Schema.String)),
    baseline: Schema.optionalKey(Baseline),
  }),
);

const kindFolders: ReadonlySet<string> = new Set(["services", "utils", "utilities", "helpers"]);
const kindFile = /(?:^|[.\-_])(?:service|utils?|helpers?)\.[cm]?[jt]sx?$/u;

/** The kind word a path is named by, if any. */
const kindIn = (path: string): Option.Option<string> => {
  const parts = path.split("/");
  const folder = Arr.findFirst(parts.slice(0, -1), (part) => kindFolders.has(part));
  if (Option.isSome(folder)) return Option.map(folder, (name) => `${name}/`);
  return Option.map(
    Option.filter(Arr.last(parts), (file) => kindFile.test(file)),
    (file) => file,
  );
};

export const noKindNamedFiles = Rule.define({
  name: "no-kind-named-files",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Name files and folders by the concept they hold (notes/due-date.ts), not by kind (services/, *.service.ts, utils, helpers).",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
          baseline: baselineJsonSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allow: [] }],
  }),
  options: Options,
  create: function* (options) {
    return yield* withBaseline(options?.baseline, (ctx) =>
      Effect.sync((): Visitor.EffectVisitor => {
        if (isTestModule(ctx) || matchesFileGlobs(ctx, options?.allow ?? [])) return skipFile;
        return {
          Program: (node: ESTree.Program) =>
            Option.match(kindIn(lintRootPath(ctx)), {
              onNone: () => Effect.void,
              onSome: (kind) =>
                ctx.report(
                  Diagnostic.make({
                    node,
                    message: `This path is named by kind (\`${kind}\`), so the name says what sort of code the file holds, not what it is about, and unrelated concepts collect in one place. Name the folder by the domain concept and the file by what it defines: \`notes/note.ts\`, \`notes/due-date.ts\`, \`notes/postgres.ts\`.`,
                  }),
                ),
            }),
        };
      }),
    );
  },
});
