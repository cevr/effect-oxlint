/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

const forbiddenSymbolName = "shape";

function containsForbiddenSymbolName(name: string): boolean {
  return name.toLowerCase().includes(forbiddenSymbolName);
}

/** Return whether an identifier names a statically accessed member owned by another value. */
function isBorrowedMemberName(node: ESTree.Node): boolean {
  const parent = node.parent;
  if (parent === null || parent.type !== "MemberExpression") return false;
  return parent.property === node && !parent.computed;
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
      containsForbiddenSymbolName(node.name) && !isBorrowedMemberName(node)
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
