/**
 * A ratchet for a ban a project adopts with the findings it already has
 * (LANDMINES LM-RATCHET): the `baseline` option maps a file's path to its
 * count of findings. A file with exactly that count is silent; with more,
 * every finding is reported, since a count cannot tell which one is new;
 * with fewer, one finding at the file's start names the new count, so the
 * baseline only shrinks. A count of zero is no entry, and the schema
 * refuses it.
 *
 * A key names a path relative to the lint root, matched as the whole path
 * or a suffix at a `/` (`src/a.ts` matches `packages/x/src/a.ts`, not
 * `src/xa.ts`). A count is silent about which findings it holds: a fixed one
 * and a new one cancel. A diff-scoped check is the stricter tool.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, RuleContext, Visitor } from "../vendor/effect-oxlint/index.js";
import { lintRootPath } from "./_test-files.js";

/**
 * The `baseline` option's schema: path to a count of findings. oxlint
 * refuses a count below 1 by baselineJsonSchema, before the rule runs.
 */
export const Baseline = Schema.Record(Schema.String, Schema.Int);

/** The `baseline` option's JSON schema, for a rule's `meta.schema`. */
export const baselineJsonSchema = {
  type: "object",
  additionalProperties: { type: "integer", minimum: 1 },
} as const;

/** The count `baseline` holds for `path`: its whole path, or a suffix at a `/`. */
export const allowanceFor = (
  baseline: Readonly<Record<string, number>>,
  path: string,
): Option.Option<number> =>
  Option.fromNullishOr(
    Object.entries(baseline).find(([key]) => path === key || path.endsWith(`/${key}`))?.[1],
  );

/** The stale finding's message: the file has fewer findings than its entry. */
const staleMessage = (path: string, found: number, allowed: number): string => {
  const left = `stale baseline: ${path} has ${found} of this rule's findings, not ${allowed}.`;
  if (found === 0) return `${left} Remove its entry: the baseline only shrinks.`;
  return `${left} Lower its entry to ${found}: the baseline only shrinks.`;
};

/**
 * Run a rule's `create` under `baseline`. `create` reports through the
 * context it is given: under an entry, that context holds every report until
 * the file ends, then all, none or one stale finding is reported, by the
 * count.
 */
export const withBaseline = <E>(
  baseline: Readonly<Record<string, number>> = {},
  create: (ctx: RuleContext["Service"]) => Effect.Effect<Visitor.EffectVisitor, E, RuleContext>,
): Effect.Effect<Visitor.EffectVisitor, E, RuleContext> =>
  Effect.gen(function* () {
    const ctx = yield* RuleContext;
    const path = lintRootPath(ctx);
    const allowance = allowanceFor(baseline, path);
    if (Option.isNone(allowance)) return yield* create(ctx);
    const held: Array<Parameters<RuleContext["Service"]["report"]>[0]> = [];
    const holding = RuleContext.of({
      ...ctx,
      report: (diagnostic) =>
        Effect.sync(() => {
          held.push(diagnostic);
        }),
    });
    const visitor = yield* Effect.provideService(create(holding), RuleContext, holding);
    const allowed = allowance.value;
    const settle = Effect.suspend(() => {
      if (held.length === allowed) return Effect.void;
      if (held.length > allowed) return Effect.forEach(held, ctx.report, { discard: true });
      return ctx.report(
        Diagnostic.make({
          node: { range: [0, 0] },
          message: staleMessage(path, held.length, allowed),
        }),
      );
    });
    return Visitor.merge(
      visitor,
      Visitor.on("Program:exit", () => settle),
    );
  });
