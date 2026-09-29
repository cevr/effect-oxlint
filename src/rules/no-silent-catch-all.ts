/** Do not silently erase every failure with Effect.void. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

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
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        const catchesAll =
          isStaticMember(node.callee, namespaces, "catchAll") ||
          isStaticMember(node.callee, namespaces, "catchAllCause");
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
