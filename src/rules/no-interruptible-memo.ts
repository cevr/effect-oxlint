/**
 * Memoize an effect so that an interrupted first run is not kept.
 *
 * `Effect.cached`, `Effect.cachedWithTTL` and `Effect.cachedInvalidateWithTTL`
 * run the memoized effect in the fiber of its first caller and keep the exit
 * that fiber reaches. When that caller is interrupted (a cancelled request, a
 * timeout, a user who presses Esc), the memo keeps the interruption: every
 * later caller gets it back, and the effect never runs again until the TTL
 * ends.
 *
 * Memoize a started fiber instead (fork the effect once with
 * `Effect.forkDetach`, and let each caller `Fiber.join` it, so an interrupt
 * reaches only that caller), or use `Cache`, which runs each lookup in a
 * fiber of its own.
 *
 * Not reported: a memoized effect that is `Effect.uninterruptible` as its
 * last step, since its exit is then the effect's own, and a TTL given as a
 * function, which decides the lifetime of each exit and can give an
 * interruption none. `Effect.uninterruptibleMask` is reported, since its
 * `restore` makes the effect interruptible again. The rule reads the
 * data-first call, the data-last operator in a `.pipe(...)` or `pipe(...)`,
 * and a const that holds the memoized effect.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument } from "./_call-arguments.js";
import { constResolver, type ResolveConst } from "./_const-bindings.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

/** Each memo constructor, with the argument count of its data-last form. */
const memoizers: ReadonlyArray<readonly [name: string, dataLastArity: number]> = [
  ["cached", 0],
  ["cachedWithTTL", 1],
  ["cachedInvalidateWithTTL", 1],
];

const uninterruptible = ["uninterruptible"];

const isFunction = (node: ESTree.Expression): boolean =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** The operator list and the piped value of a `.pipe(...)` or `pipe(...)` call holding `operator`. */
interface PipeContext {
  readonly value: ESTree.Expression;
  readonly before: ReadonlyArray<ESTree.Argument>;
}

const pipeContext = (operator: ESTree.Expression): Option.Option<PipeContext> => {
  const call = operator.parent;
  if (call?.type !== "CallExpression" || call.callee.type === "Super") return Option.none();
  const index = call.arguments.indexOf(operator);
  if (index < 0) return Option.none();
  const callee = call.callee;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    callee.property.name === "pipe" &&
    callee.object.type !== "Super"
  ) {
    return Option.some({ value: callee.object, before: call.arguments.slice(0, index) });
  }
  if (callee.type === "Identifier" && callee.name === "pipe" && index > 0) {
    return Option.map(expressionArgument(call, 0), (value) => ({
      value,
      before: call.arguments.slice(1, index),
    }));
  }
  return Option.none();
};

export const noInterruptibleMemo = Rule.define({
  name: "no-interruptible-memo",
  meta: Rule.meta({
    type: "problem",
    description:
      "Memoize a started fiber or use Cache: Effect.cached keeps its first caller's interruption for every later caller.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const resolve: ResolveConst = constResolver(ctx);

    /** Whether `node` names `Effect.uninterruptible`. */
    const isUninterruptibleOperator = (
      node: ESTree.Argument,
      effects: ReadonlySet<string>,
    ): boolean =>
      node.type !== "SpreadElement" &&
      uninterruptible.some((name) => isStaticMember(resolve(node), effects, name));

    /** Whether the effect's last step is uninterruptible. */
    const isUninterruptible = (
      expression: ESTree.Expression,
      effects: ReadonlySet<string>,
    ): boolean => {
      const node = resolve(expression);
      if (node.type !== "CallExpression" || node.callee.type === "Super") return false;
      const callee = node.callee;
      if (uninterruptible.some((name) => isStaticMember(callee, effects, name))) return true;
      const isPipe =
        (callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === "pipe") ||
        (callee.type === "Identifier" && callee.name === "pipe");
      return (
        isPipe &&
        Option.exists(Arr.last(node.arguments), (last) => isUninterruptibleOperator(last, effects))
      );
    };

    /** Whether a data-last memo operator memoizes an uninterruptible effect. */
    const pipesUninterruptible = (
      operator: ESTree.Expression,
      effects: ReadonlySet<string>,
    ): boolean =>
      Option.exists(pipeContext(operator), ({ value, before }) => {
        const last = Arr.last(before);
        if (Option.isSome(last)) return isUninterruptibleOperator(last.value, effects);
        return isUninterruptible(value, effects);
      });

    /** Whether this use of a memo constructor is safe: an uninterruptible effect, or a TTL function. */
    const isExempt = (
      member: ESTree.MemberExpression,
      dataLastArity: number,
      effects: ReadonlySet<string>,
    ): boolean => {
      const call = member.parent;
      if (call?.type !== "CallExpression" || call.callee !== member) {
        return pipesUninterruptible(member, effects);
      }
      if (call.arguments.length > dataLastArity) {
        const ttl = expressionArgument(call, 1);
        if (Option.exists(ttl, (node) => isFunction(resolve(node)))) return true;
        return Option.exists(expressionArgument(call, 0), (self) =>
          isUninterruptible(self, effects),
        );
      }
      const ttl = expressionArgument(call, 0);
      if (dataLastArity > 0 && Option.exists(ttl, (node) => isFunction(resolve(node)))) {
        return true;
      }
      return pipesUninterruptible(call, effects);
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      MemberExpression: (node: ESTree.MemberExpression) => {
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        const memo = Arr.findFirst(memoizers, ([name]) => isStaticMember(node, effects, name));
        if (Option.isNone(memo)) return Effect.void;
        const [name, dataLastArity] = memo.value;
        if (isExempt(node, dataLastArity, effects)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Effect.${name} keeps the exit of its first caller, an interruption included: once that caller is interrupted, every later caller gets the interruption back. Memoize a started fiber (fork it once, then Fiber.join in each caller), or use Cache, which runs each lookup in a fiber of its own.`,
          }),
        );
      },
    };
  },
});
