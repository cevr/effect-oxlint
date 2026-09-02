/**
 * Cap the Halstead difficulty of every function.
 *
 * Halstead difficulty is `(η1 / 2) × (N2 / η2)`: half the number of distinct
 * operators, scaled by how often each operand is reused. A high value marks
 * a function that juggles many kinds of syntax over the same few values.
 *
 * Nested functions are measured separately. Extract repeated expressions
 * into named values or helper functions.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { halstead, halsteadDifficulty, isFunctionNode } from "./_function-metrics.js";
import { MaxOptions, maxOptionsMeta, resolveMax } from "./_max-option.js";

const DEFAULT_MAX = 79;

const formatDifficulty = (value: number): string => String(Math.round(value * 10) / 10);

export const maxHalsteadDifficulty = Rule.define({
  name: "max-halstead-difficulty",
  meta: Rule.meta({
    type: "suggestion",
    description: "Keep every function below the Halstead difficulty limit.",
    messages: {
      tooDifficult:
        "Function has a Halstead difficulty of {{value}}. Maximum allowed is {{max}}. Extract repeated expressions into named values.",
    },
    ...maxOptionsMeta(DEFAULT_MAX),
  }),
  options: MaxOptions,
  create: function* (options) {
    const context = yield* RuleContext;
    const max = resolveMax(options, DEFAULT_MAX);

    const check = (node: ESTree.Node) => {
      if (!isFunctionNode(node)) return Effect.void;
      const value = halsteadDifficulty(halstead(node));
      if (value <= max) return Effect.void;
      return context.report(
        Diagnostic.fromId({
          node,
          messageId: "tooDifficult",
          data: { value: formatDifficulty(value), max: String(max) },
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
