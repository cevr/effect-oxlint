/**
 * Feature components and hooks have no `useEffect`; an effect lives in a
 * named host adapter hook.
 *
 * Reported: every `useEffect` / `useLayoutEffect` call (also as
 * `React.useEffect`) outside test modules, except one whose nearest named
 * enclosing function matches `adapterHooks` (a regex source, default
 * `Adapter$|Subscription$`: `useWindowSizeSubscription`) and one in a file
 * that matches an `adapters` glob (relative to the lint root, as
 * `effect.testFiles`). A ban: a project adopts it with a baseline of the
 * effects it has and lets the baseline only shrink. Source: the react skill
 * "Feature components and hooks have no `useEffect`"; `server-state.md`
 * "Effects stay out of feature code" (catalog SR-R04).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule } from "../vendor/effect-oxlint/index.js";
import type { Visitor } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf, isFunction } from "./_anti-slop-effect.js";
import { functionName, hookName, isEffectHook } from "./_react.js";
import { Baseline, baselineJsonSchema, withBaseline } from "./_baseline.js";
import { isTestModule, matchesFileGlobs, skipFile } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    adapters: Schema.optionalKey(Schema.Array(Schema.String)),
    adapterHooks: Schema.optionalKey(Schema.String),
    baseline: Schema.optionalKey(Baseline),
  }),
);

/** The name of the nearest enclosing function that has one. */
const enclosingName = (node: ESTree.Node): Option.Option<string> =>
  Arr.findFirst(ancestorsOf(node), (ancestor) => {
    if (!isFunction(ancestor)) return Option.none();
    return functionName(ancestor);
  });

export const noEffectInFeature = Rule.define({
  name: "no-effect-in-feature",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Keep useEffect out of feature components and hooks; an effect lives in a named host adapter hook.",
    docs: { recommended: false, preset: "skills-react" },
    schema: [
      {
        type: "object",
        properties: {
          adapters: { type: "array", items: { type: "string" } },
          adapterHooks: { type: "string" },
          baseline: baselineJsonSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ adapters: [], adapterHooks: "Adapter$|Subscription$" }],
  }),
  options: Options,
  create: function* (options) {
    return yield* withBaseline(options?.baseline, (ctx) =>
      Effect.sync((): Visitor.EffectVisitor => {
        if (isTestModule(ctx) || matchesFileGlobs(ctx, options?.adapters ?? [])) return skipFile;
        const adapterHook = new RegExp(options?.adapterHooks ?? "Adapter$|Subscription$", "u");
        return {
          CallExpression: (node: ESTree.CallExpression) => {
            if (!isEffectHook(node)) return Effect.void;
            if (Option.exists(enclosingName(node), (name) => adapterHook.test(name))) {
              return Effect.void;
            }
            const hook = Option.getOrElse(hookName(node), () => "useEffect");
            return ctx.report(
              Diagnostic.make({
                node,
                message: `\`${hook}\` in feature code runs a side effect after render, where the reader cannot see what starts it or when it stops. Derive values during render, run work in the event handler that causes it, read server state through a query, and put a real subscription in a named adapter hook (\`useWindowSizeSubscription\`) or an adapter file the \`adapters\` option lists.`,
              }),
            );
          },
        };
      }),
    );
  },
});
