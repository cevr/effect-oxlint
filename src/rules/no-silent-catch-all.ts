/** Do not silently erase every failure with Effect.void. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { staticProperties } from "./_call-arguments.js";
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
        if (logsWhatItDrops(node)) return Effect.void;
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
