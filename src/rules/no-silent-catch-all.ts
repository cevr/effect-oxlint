/** Do not silently erase every failure with Effect.void. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { staticProperties } from "./_call-arguments.js";
import { ancestors } from "./_ast-ancestors.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

/** The catch-everything combinators: Effect 4's `catch` and `catchCause`, and Effect 3's names. */
const catchAllNames = ["catch", "catchCause", "catchAll", "catchAllCause"] as const;

/** The combinators that drop every failure with no handler at all. */
const ignoreNames = ["ignore", "ignoreCause"] as const;

/** Whether `Effect.ignore` is called with options that log what it drops (`{ log: … }`). */
const logsWhatItDrops = (node: ESTree.MemberExpression): boolean => {
  const call = node.parent;
  if (call?.type !== "CallExpression" || call.callee !== node) return false;
  return call.arguments.some(
    (argument) =>
      argument.type === "ObjectExpression" &&
      staticProperties(argument, "log").some(
        (property) => !(property.value.type === "Literal" && property.value.value === false),
      ),
  );
};

/** The combinators whose last argument is a finalizer: what it ignores is best-effort cleanup. */
const finalizerNames = ["ensuring", "addFinalizer", "acquireRelease"] as const;

/** The calls whose failure is a cleanup's to drop: removing a file, a directory or a socket. */
const cleanupNames: ReadonlySet<string> = new Set(["remove", "rm"]);

const within = (node: ESTree.Node, outer: ESTree.Node): boolean =>
  node.start >= outer.start && node.end <= outer.end;

/** Whether `Effect.ignore` sits in the finalizer argument of ensuring, addFinalizer or acquireRelease. */
const inFinalizer = (node: ESTree.MemberExpression, namespaces: ReadonlySet<string>): boolean =>
  Arr.some(Arr.fromIterable(ancestors(node)), (ancestor) => {
    if (ancestor.type !== "CallExpression") return false;
    if (!finalizerNames.some((name) => isStaticMember(ancestor.callee, namespaces, name)))
      return false;
    return Option.exists(Arr.last(ancestor.arguments), (finalizer) => within(node, finalizer));
  });

/** The pipe step: `Effect.ignore(options)` when it is called with options, else `Effect.ignore` itself. */
const operatorOf = (node: ESTree.MemberExpression): ESTree.Node => {
  const call = node.parent;
  if (call?.type === "CallExpression" && call.callee === node) return call;
  return node;
};

/** The effect `Effect.ignore` drops: `Effect.ignore(x)`, `x.pipe(…, Effect.ignore)` or `pipe(x, …, Effect.ignore)`. */
const ignoredEffect = (node: ESTree.MemberExpression): Option.Option<ESTree.Node> => {
  const call = node.parent;
  if (
    call?.type === "CallExpression" &&
    call.callee === node &&
    Option.exists(Arr.head(call.arguments), (first) => first.type !== "ObjectExpression")
  ) {
    return Arr.head(call.arguments);
  }
  const pipe = operatorOf(node).parent;
  if (pipe?.type !== "CallExpression" || pipe.callee.type === "Super") return Option.none();
  if (
    pipe.callee.type === "MemberExpression" &&
    !pipe.callee.computed &&
    pipe.callee.property.type === "Identifier" &&
    pipe.callee.property.name === "pipe"
  ) {
    if (pipe.callee.object.type === "Super") return Option.none();
    return Option.some(pipe.callee.object);
  }
  if (pipe.callee.type === "Identifier" && pipe.callee.name === "pipe")
    return Arr.head(pipe.arguments);
  return Option.none();
};

/** Whether the dropped effect is a call to remove or rm: best-effort cleanup. */
const dropsCleanup = (node: ESTree.MemberExpression): boolean =>
  Option.exists(ignoredEffect(node), (effect) => {
    if (effect.type !== "CallExpression") return false;
    const callee = effect.callee;
    if (callee.type === "Identifier") return cleanupNames.has(callee.name);
    return (
      callee.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.type === "Identifier" &&
      cleanupNames.has(callee.property.name)
    );
  });

/** Whether a comment ends the line before the one `node` starts on: the drop is explained. */
const explainedAbove = (
  text: string,
  comments: ReadonlyArray<{ readonly start: number; readonly end: number }>,
  node: ESTree.Node,
): boolean => {
  const lineStart = text.lastIndexOf("\n", node.start - 1) + 1;
  if (lineStart === 0) return false;
  const previousStart = text.lastIndexOf("\n", lineStart - 2) + 1;
  return comments.some(
    (comment) =>
      comment.end >= previousStart &&
      comment.end < lineStart &&
      text.slice(comment.end, lineStart).trim() === "",
  );
};

type Handler = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (node: ESTree.Argument): node is Handler =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const isEffectVoid = (node: ESTree.Expression, effectNamespaces: ReadonlySet<string>): boolean =>
  isStaticMember(node, effectNamespaces, "void");

const silentlyReturnsVoid = (node: Handler, effectNamespaces: ReadonlySet<string>): boolean => {
  const body = node.body;
  if (node.params.length !== 0 || Predicate.isNull(body)) return false;
  if (body.type !== "BlockStatement") return isEffectVoid(body, effectNamespaces);
  if (body.body.length !== 1) return false;
  return Option.exists(
    Arr.head(body.body),
    (statement) =>
      statement.type === "ReturnStatement" &&
      Predicate.isNotNull(statement.argument) &&
      isEffectVoid(statement.argument, effectNamespaces),
  );
};

/** The handler of a data-last (one argument) or data-first catch call. */
const handlerArgument = (node: ESTree.CallExpression): Option.Option<ESTree.Argument> => {
  if (node.arguments.length === 1) return Arr.get(node.arguments, 0);
  return Arr.get(node.arguments, 1);
};

export const noSilentCatchAll = Rule.define({
  name: "no-silent-catch-all",
  meta: Rule.meta({
    type: "problem",
    description: "Do not silently erase every failure with Effect.void.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      MemberExpression: (node) => {
        if (node.type !== "MemberExpression") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        if (!ignoreNames.some((name) => isStaticMember(node, namespaces, name))) return Effect.void;
        if (logsWhatItDrops(node) || inFinalizer(node, namespaces) || dropsCleanup(node))
          return Effect.void;
        if (explainedAbove(ctx.sourceCode.text, ctx.sourceCode.getAllComments(), node))
          return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Effect.ignore erases every failure without a trace. Recover a typed failure truthfully, or log what it drops with Effect.ignore({ log: true }).",
          }),
        );
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        const catchesAll = catchAllNames.some((name) =>
          isStaticMember(node.callee, namespaces, name),
        );
        if (!catchesAll) return Effect.void;
        const silentHandler = Option.filter(
          Option.filter(handlerArgument(node), isFunction),
          (handler) => silentlyReturnsVoid(handler, namespaces),
        );
        return Option.match(silentHandler, {
          onNone: () => Effect.void,
          onSome: (handler) =>
            ctx.report(
              Diagnostic.make({
                node: handler,
                message:
                  "Do not erase every failure with Effect.void. Recover a typed failure truthfully or record the unexpected failure before recovery.",
              }),
            ),
        });
      },
    };
  },
});
