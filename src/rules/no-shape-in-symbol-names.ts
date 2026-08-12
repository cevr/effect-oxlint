/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

const forbiddenSymbolName = "shape";

function containsForbiddenSymbolName(name: string): boolean {
  return name.toLowerCase().includes(forbiddenSymbolName);
}

/** Ban the case-insensitive substring "shape" in every JavaScript and TypeScript symbol name. */
export const noShapeInSymbolNames = Rule.define({
  name: "no-shape-in-symbol-names",
  meta: Rule.meta({
    type: "problem",
    description:
      'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
    messages: {
      forbiddenSymbolName:
        'Do not use the case-insensitive substring "shape" in symbol names (found "{{name}}").',
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    const reportForbiddenSymbolName = (node: ESTree.Node & { name: string }) =>
      containsForbiddenSymbolName(node.name)
        ? context.report(
            Diagnostic.fromId({
              node,
              messageId: "forbiddenSymbolName",
              data: { name: node.name },
            }),
          )
        : Effect.void;
    return {
      Identifier: reportForbiddenSymbolName,
      PrivateIdentifier: reportForbiddenSymbolName,
      JSXIdentifier: reportForbiddenSymbolName,
    };
  },
});
