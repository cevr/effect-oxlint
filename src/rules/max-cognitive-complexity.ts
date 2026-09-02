/**
 * Cap the cognitive complexity of every function.
 *
 * Cognitive complexity (SonarSource) scores how hard a function is to read:
 * branches and loops cost one, nesting makes each inner branch cost more,
 * and every change of logical operator in a condition costs one.
 *
 * Nested functions are measured separately. Split a heavy function into
 * named `Effect.fn` operations, `Match` dispatch, or helper functions.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { cognitiveComplexity, isFunctionNode } from "./_function-metrics.js";
import { MaxOptions, maxOptionsMeta, resolveMax } from "./_max-option.js";

const DEFAULT_MAX = 21;

export const maxCognitiveComplexity = Rule.define({
  name: "max-cognitive-complexity",
  meta: Rule.meta({
    type: "suggestion",
    description: "Keep every function below the cognitive complexity limit.",
    messages: {
      tooComplex:
        "Function has a cognitive complexity of {{value}}. Maximum allowed is {{max}}. Split it into named operations.",
    },
    ...maxOptionsMeta(DEFAULT_MAX),
  }),
  options: MaxOptions,
  create: function* (options) {
    const context = yield* RuleContext;
    const max = resolveMax(options, DEFAULT_MAX);

    const check = (node: ESTree.Node) => {
      if (!isFunctionNode(node)) return Effect.void;
      const value = cognitiveComplexity(node);
      if (value <= max) return Effect.void;
      return context.report(
        Diagnostic.fromId({
          node,
          messageId: "tooComplex",
          data: { value: String(value), max: String(max) },
        }),
      );
    };

    return {
      ArrowFunctionExpression: check,
      FunctionDeclaration: check,
      FunctionExpression: check,
    };
  },
});
