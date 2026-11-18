/**
 * Recover from typed failures by tag; cause-level recovery belongs to a named
 * safety boundary.
 *
 * Reported: `Effect.catchAllCause`, `Effect.catchCause` and
 * `Effect.sandbox` (read or called) outside test modules, except in a file
 * that matches a `boundaries` glob (relative to the lint root) and except
 * under a comment that names the boundary: a comment on the lines before the
 * statement containing `boundary: <reason>`. A ban: a project adopts it with
 * a baseline that only shrinks. Source: the effect skill "Do not use
 * cause-level recovery when typed-error recovery is enough" (catalog SR-E06).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf } from "./_anti-slop-effect.js";
import { Baseline, baselineJsonSchema, withBaseline } from "./_baseline.js";
import { isTestModule, matchesFileGlobs, skipFile } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    boundaries: Schema.optionalKey(Schema.Array(Schema.String)),
    baseline: Schema.optionalKey(Baseline),
  }),
);

const causeRecovery: ReadonlySet<string> = new Set(["catchAllCause", "catchCause", "sandbox"]);
const boundaryNote = /\bboundary:\s*\S/u;

/** The statement that holds a node: the outermost ancestor below a block or the program. */
const statementOf = (node: ESTree.Node): ESTree.Node => {
  let child = node;
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor.type === "BlockStatement" || ancestor.type === "Program") return child;
    child = ancestor;
  }
  return child;
};

export const noCauseRecoveryOutsideBoundary = Rule.define({
  name: "no-cause-recovery-outside-boundary",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Recover typed failures with catchTag or catchTags; keep catchAllCause, catchCause and sandbox to a named safety boundary.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          boundaries: { type: "array", items: { type: "string" } },
          baseline: baselineJsonSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ boundaries: [] }],
  }),
  options: Options,
  create: function* (options) {
    return yield* withBaseline(options?.baseline, (ctx) =>
      Effect.sync((): Visitor.EffectVisitor => {
        if (isTestModule(ctx) || matchesFileGlobs(ctx, options?.boundaries ?? [])) return skipFile;
        const noted = (node: ESTree.Node): boolean =>
          Arr.some(ctx.sourceCode.getCommentsBefore(statementOf(node)), (comment) =>
            boundaryNote.test(comment.value),
          );
        return {
          MemberExpression: (node: ESTree.MemberExpression) => {
            const recovery =
              !node.computed &&
              node.object.type === "Identifier" &&
              node.object.name === "Effect" &&
              node.property.type === "Identifier" &&
              causeRecovery.has(node.property.name);
            if (!recovery || noted(node)) return Effect.void;
            return ctx.report(
              Diagnostic.make({
                node,
                message: `\`${ctx.sourceCode.getText(node)}\` recovers from every cause (defects and interruptions too), so a bug the caller should see becomes a handled value. Recover the typed failures you expect with \`Effect.catchTag\` / \`Effect.catchTags\`; keep cause-level recovery to the safety boundary (a server's request handler, a worker's loop), in a file the \`boundaries\` option lists or under a \`// boundary: <reason>\` comment.`,
              }),
            );
          },
        };
      }),
    );
  },
});
