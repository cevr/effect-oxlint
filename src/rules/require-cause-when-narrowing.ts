/**
 * A narrowing handler that replaces an error keeps the original as `cause`.
 *
 * Reported: an `Effect.mapError`, `catch`, `catchAll`, `catchCause` or
 * `orElse` handler that never reads the error it receives and constructs a new
 * error (`new X(...)` or `X.make(...)`) without a `cause` field. A `tapError`,
 * `tapErrorCause`, `tapCause` or `tapErrorTag` earlier in the same pipeline
 * captures the original first and allows it. Ported from K-Mistele/anti-slop
 * (`require-cause-when-narrowing`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  effectModuleNames,
  genFunction,
  isFunction,
  keyName,
  moduleCall,
  moduleMember,
  precedingSteps,
  returnedExpressions,
  unwrap,
  walk,
} from "./_anti-slop-effect.js";
import type { EffectModule, EffectModuleNames, FunctionNode } from "./_anti-slop-effect.js";

const narrowingOperators: ReadonlySet<string> = new Set([
  "mapError",
  "catch",
  "catchAll",
  "catchCause",
  "orElse",
]);
const tapOperators: ReadonlySet<string> = new Set([
  "tapError",
  "tapErrorCause",
  "tapCause",
  "tapErrorTag",
]);
const modules: ReadonlyArray<EffectModule> = ["Context", "Effect", "Layer", "ManagedRuntime"];

type Construction = ESTree.NewExpression | ESTree.CallExpression;

/** The name of the object `X.make` is called on, when it is a name or a member. */
const ownerName = (owner: ESTree.Node): Option.Option<string> => {
  if (owner.type === "Identifier") return Option.some(owner.name);
  if (owner.type === "MemberExpression" && owner.property.type === "Identifier") {
    return Option.some(owner.property.name);
  }
  return Option.none();
};

/** `new X(...)`, or `X.make(...)` for a capitalized `X` that is not an Effect module. */
const isErrorConstruction = (node: ESTree.Node, names: EffectModuleNames): node is Construction => {
  if (node.type === "NewExpression") {
    const callee = unwrap(node.callee);
    return callee.type === "Identifier" || callee.type === "MemberExpression";
  }
  if (node.type !== "CallExpression") return false;
  const callee = unwrap(node.callee);
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier" ||
    callee.property.name !== "make"
  ) {
    return false;
  }
  if (!Option.exists(ownerName(unwrap(callee.object)), (name) => /^[A-Z]/u.test(name))) {
    return false;
  }
  return !modules.some((module) => Option.isSome(moduleMember(callee, names, module)));
};

/** Whether an argument is an object literal with a `cause` field, or a spread that may supply one. */
const passesCause = (node: Construction): boolean =>
  node.arguments.some((argument) => {
    const expression = unwrap(argument);
    return (
      expression.type === "ObjectExpression" &&
      expression.properties.some(
        (property) =>
          property.type === "SpreadElement" ||
          (!property.computed && Option.contains(keyName(property.key), "cause")),
      )
    );
  });

/** The errors a handler constructs as its result, outside the functions it only builds. */
const constructedErrors = (
  handler: FunctionNode,
  names: EffectModuleNames,
): ReadonlyArray<Construction> => {
  const found = new Set<Construction>();
  const consider = (node: ESTree.Node) => {
    const expression = unwrap(node);
    if (expression.type === "YieldExpression") {
      Option.map(Option.fromNullishOr(expression.argument), consider);
      return;
    }
    if (isErrorConstruction(expression, names)) found.add(expression);
  };
  for (const returned of returnedExpressions(handler)) consider(returned);
  Option.map(Option.fromNullishOr(handler.body), (body) =>
    walk(body, (node) => {
      // An Effect.gen generator runs as the handler's own effect; other nested functions run later, if at all.
      if (isFunction(node)) {
        return Option.exists(genFunction(node.parent, names), (generator) => generator === node);
      }
      if (
        node.type === "CallExpression" &&
        Option.contains(moduleCall(node, names, "Effect"), "fail")
      ) {
        Option.map(Option.fromUndefinedOr(node.arguments[0]), consider);
      }
      if (node.type === "YieldExpression" && node.delegate) {
        Option.map(Option.fromNullishOr(node.argument), consider);
      }
      return true;
    }),
  );
  return [...found];
};

/** Whether `node` is a tap operator or a call of one. */
const isTapStep = (node: ESTree.Node, names: EffectModuleNames): boolean => {
  const member = Option.orElse(moduleCall(node, names, "Effect"), () =>
    moduleMember(node, names, "Effect"),
  );
  return Option.exists(member, (name) => tapOperators.has(name));
};

export const requireCauseWhenNarrowing = Rule.define({
  name: "require-cause-when-narrowing",
  meta: Rule.meta({
    type: "problem",
    description:
      "Require Effect.mapError/catch/catchAll/catchCause/orElse handlers that construct a new error to keep the original as `cause`.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const names = effectModuleNames(ctx.sourceCode.ast);

    /** Whether the handler never reads the error it receives. */
    const ignoresError = (handler: FunctionNode): boolean => {
      const parameter = handler.params.at(0);
      if (!parameter) return true;
      if (parameter.type !== "Identifier") return false;
      return ctx.sourceCode
        .getDeclaredVariables(handler)
        .some(
          (variable) =>
            variable.identifiers.some((identifier) => identifier === parameter) &&
            variable.references.length === 0,
        );
    };

    /** The steps before the operator: the data-first source, or the pipeline's earlier steps. */
    const earlierSteps = (node: ESTree.CallExpression): ReadonlyArray<ESTree.Node> => {
      if (node.arguments.length > 1) return node.arguments.slice(0, 1);
      return precedingSteps(node);
    };

    /** The text naming the constructed error: `X` of `new X(...)` or of `X.make(...)`. */
    const errorText = (constructed: Construction): string => {
      const callee = unwrap(constructed.callee);
      if (callee.type === "MemberExpression") return ctx.sourceCode.getText(callee.object);
      return ctx.sourceCode.getText(callee);
    };

    /** The error a narrowing handler builds without its cause, with the operator's name. */
    const uncaused = (
      node: ESTree.CallExpression,
    ): Option.Option<{ readonly operator: string; readonly constructed: Construction }> =>
      Option.flatMap(
        Option.filter(moduleCall(node, names, "Effect"), (name) => narrowingOperators.has(name)),
        (operator) => {
          const handler = Option.filter(Option.fromUndefinedOr(node.arguments.at(-1)), isFunction);
          return Option.flatMap(Option.filter(handler, ignoresError), (fn) => {
            if (earlierSteps(node).some((step) => isTapStep(step, names))) return Option.none();
            return Option.map(
              Option.fromUndefinedOr(
                constructedErrors(fn, names).find((made) => !passesCause(made)),
              ),
              (constructed) => ({ operator, constructed }),
            );
          });
        },
      );

    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(uncaused(node), {
          onNone: () => Effect.void,
          onSome: ({ operator, constructed }) =>
            ctx.report(
              Diagnostic.make({
                node: constructed,
                message: `This Effect.${operator} handler discards the original error and constructs a new one without it. Name the handler's parameter and pass it as \`cause\` (\`(error) => new ${errorText(constructed)}({ ..., cause: error })\`), or log it first with \`Effect.tapError(Effect.logError)\` before narrowing.`,
              }),
            ),
        }),
    };
  },
});
