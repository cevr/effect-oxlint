/**
 * Pipe values through `withX` adapters instead of wrapping calls in them.
 *
 * - `withX(inner(...))`, `withX(inner(...), arg)`, and `withX(arg)(inner(...))`
 *   hide the value being transformed inside the adapter. `inner(...).pipe(withX)`
 *   reads left to right in the order the steps run.
 * - `withX(callback)` and `withX(arg, callback)` invert control. Expose an
 *   Effect value or a provider and continue with `.pipe(...)`.
 * - A `withX` definition that takes an `Effect.Effect` parameter (at any curried
 *   level, and inside `Effect.fn` or `Effect.fnUntraced`) or a callback
 *   parameter is the helper those calls need.
 *
 * A `withX(...)` passed straight to `.pipe(...)` is an adapter factory, not a
 * wrapper. Test modules may keep callback helpers and their calls. The `allow`
 * option names adapters whose wrapping form is their intended API, such as a
 * library's `withBoundary(handler)`.
 *
 * The `testFiles` option narrows that exemption. By default it covers every
 * test module (`*.test.*`, `*.spec.*` and the shared `effect.testFiles`
 * setting). With `testFiles`, only files whose lint-root path matches one of
 * its globs keep callback helpers; every other file, test modules included,
 * is held to the callback and definition checks. A project can allow local
 * fixture helpers in a `tests/` tree while shared harness code that the
 * setting counts as test code is still held:
 *
 * ```json
 * { "rules": { "effect/noWithWrapperCall": ["error", { "testFiles": ["**\/tests/**"] }] } }
 * ```
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, matchesFileGlobs } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    allow: Schema.optionalKey(Schema.Array(Schema.String)),
    testFiles: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
);

const wrapperPattern = /^with[A-Z]/u;

const isFunction = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** The `withX` name a callee reads: `withX` or `Module.withX`. */
const wrapperName = (callee: ESTree.Node): Option.Option<string> => {
  if (callee.type === "Identifier") {
    return Option.liftPredicate(callee.name, (name) => wrapperPattern.test(name));
  }
  if (callee.type !== "MemberExpression" || callee.computed) return Option.none();
  if (callee.property.type !== "Identifier") return Option.none();
  return Option.liftPredicate(callee.property.name, (name) => wrapperPattern.test(name));
};

/** A direct argument of `.pipe(...)`: an adapter factory, not a wrapper. */
const isPipeArgument = (node: ESTree.CallExpression): boolean => {
  const parent = node.parent;
  return (
    parent?.type === "CallExpression" &&
    parent.arguments.some((argument) => argument === node) &&
    parent.callee.type === "MemberExpression" &&
    !parent.callee.computed &&
    parent.callee.property.type === "Identifier" &&
    parent.callee.property.name === "pipe"
  );
};

type WrapperKind = "invocation" | "callback";

const wrapperCall = (
  node: ESTree.CallExpression,
): Option.Option<{ readonly name: string; readonly kind: WrapperKind }> => {
  if (isPipeArgument(node)) return Option.none();
  const direct = wrapperName(node.callee);
  if (Option.isSome(direct)) {
    if (node.arguments[0]?.type === "CallExpression") {
      return Option.some({ name: direct.value, kind: "invocation" });
    }
    if (node.callee.type === "Identifier" && node.arguments.some(isFunction)) {
      return Option.some({ name: direct.value, kind: "callback" });
    }
  }
  if (node.callee.type !== "CallExpression") return Option.none();
  const [only, ...rest] = node.arguments;
  if (only?.type !== "CallExpression" || rest.length > 0) return Option.none();
  return Option.map(wrapperName(node.callee.callee), (name) => ({ name, kind: "invocation" }));
};

const isEffectFnCallee = (callee: ESTree.Node): boolean =>
  callee.type === "MemberExpression" &&
  !callee.computed &&
  callee.object.type === "Identifier" &&
  callee.object.name === "Effect" &&
  callee.property.type === "Identifier" &&
  ["fn", "fnUntraced"].includes(callee.property.name);

/** The function a definition runs: the generator inside `Effect.fn(...)`, or the value itself. */
const definitionFunction = (init: ESTree.Node): Option.Option<ESTree.Node> => {
  if (init.type !== "CallExpression") return Option.some(init);
  const traced =
    isEffectFnCallee(init.callee) ||
    (init.callee.type === "CallExpression" && isEffectFnCallee(init.callee.callee));
  if (!traced) return Option.some(init);
  return Option.fromUndefinedOr(init.arguments.find(isFunction));
};

/** The parameter lists of a function and of each function its body returns directly. */
const curriedParams = (fn: ESTree.Node): ReadonlyArray<ReadonlyArray<ESTree.Node>> => {
  if (fn.type === "ArrowFunctionExpression") {
    return [fn.params, ...curriedParams(fn.body)];
  }
  if (fn.type === "FunctionExpression" || fn.type === "FunctionDeclaration") {
    return [fn.params];
  }
  return [];
};

const annotation = (param: ESTree.Node): Option.Option<ESTree.TSType> => {
  if (param.type !== "Identifier") return Option.none();
  return Option.fromNullishOr(param.typeAnnotation?.typeAnnotation);
};

const isEffectType = (type: ESTree.TSType): boolean =>
  type.type === "TSTypeReference" &&
  type.typeName.type === "TSQualifiedName" &&
  type.typeName.left.type === "Identifier" &&
  type.typeName.left.name === "Effect" &&
  type.typeName.right.name === "Effect";

/** Why a `withX` definition is a wrapper helper: it takes an Effect or a callback. */
const definitionKind = (fn: ESTree.Node): Option.Option<"effect" | "callback"> => {
  const levels = curriedParams(fn);
  const types = (params: ReadonlyArray<ESTree.Node>) =>
    params.flatMap((p) => Option.toArray(annotation(p)));
  if (levels.some((params) => types(params).some(isEffectType))) return Option.some("effect");
  const [first = []] = levels;
  if (types(first).some((type) => type.type === "TSFunctionType")) return Option.some("callback");
  return Option.none();
};

export const noWithWrapperCall = Rule.define({
  name: "no-with-wrapper-call",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Pipe values through withX adapters instead of wrapping calls or callbacks in them.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
          testFiles: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allow: [] }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const allowed = new Set(options?.allow ?? []);
    const inTest = Option.match(Option.fromUndefinedOr(options?.testFiles), {
      onNone: () => isTestModule(ctx),
      onSome: (globs) => matchesFileGlobs(ctx, globs),
    });

    const report = (node: ESTree.Node, message: string) =>
      ctx.report(Diagnostic.make({ node, message }));

    const reportDefinition = (name: string, fn: ESTree.Node, node: ESTree.Node) => {
      if (inTest || allowed.has(name) || !wrapperPattern.test(name)) return Effect.void;
      return Option.match(definitionKind(fn), {
        onNone: () => Effect.void,
        onSome: (kind) =>
          report(
            node,
            `\`${name}(${kind}, ...)\` wrapper helpers invert the pipeline. Expose a pipeable adapter or an Effect value and continue with \`.pipe(...)\`.`,
          ),
      });
    };

    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(
          Option.filter(wrapperCall(node), (call) => !allowed.has(call.name)),
          {
            onNone: () => Effect.void,
            onSome: ({ name, kind }) => {
              if (kind === "invocation") {
                return report(
                  node,
                  `Avoid \`${name}(innerCall(...))\`. Pipe the inner value through the adapter: \`innerCall(...).pipe(${name}(...))\`.`,
                );
              }
              if (inTest) return Effect.void;
              return report(
                node,
                `Avoid \`${name}(callback)\`. Expose an Effect value or a provider and continue with \`.pipe(...)\`.`,
              );
            },
          },
        ),
      VariableDeclarator: (node: ESTree.VariableDeclarator) => {
        if (node.id.type !== "Identifier" || !node.init) return Effect.void;
        const name = node.id.name;
        return Option.match(definitionFunction(node.init), {
          onNone: () => Effect.void,
          onSome: (fn) => reportDefinition(name, fn, node),
        });
      },
      FunctionDeclaration: (node: ESTree.Function) => {
        if (!node.id) return Effect.void;
        return reportDefinition(node.id.name, node, node);
      },
    };
  },
});
