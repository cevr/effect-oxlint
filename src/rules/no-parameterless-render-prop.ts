/**
 * `children` over a `render…` prop, unless the callback receives data.
 *
 * Reported: a JSX attribute named `render` followed by a capital letter
 * (`renderFooter`) whose value is an inline function of no parameters, outside
 * test modules. Such a callback passes nothing the parent does not already
 * have, so it is a slot: compose it as children. A render prop that receives
 * data (`renderItem={(item) => …}`) is left alone. Source: the composition
 * skill, `patterns-children-over-render-props` (catalog SR-R11).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isFunction } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const renderProp = /^render[A-Z]/u;

export const noParameterlessRenderProp = Rule.define({
  name: "no-parameterless-render-prop",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Pass content as children or a compound sub-component instead of a render prop that receives nothing.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    return {
      JSXAttribute: (node: ESTree.JSXAttribute) => {
        const value = node.value;
        if (
          node.name.type !== "JSXIdentifier" ||
          !renderProp.test(node.name.name) ||
          value?.type !== "JSXExpressionContainer" ||
          !isFunction(value.expression) ||
          value.expression.params.length > 0
        ) {
          return Effect.void;
        }
        const name = node.name.name;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `\`${name}\` takes no arguments, so it is a slot passed as a function: the parent cannot place it and each render makes a new callback. Pass the content as children or a compound part (\`<Card><Card.Footer>…</Card.Footer></Card>\`); keep a render prop only when it receives data.`,
          }),
        );
      },
    };
  },
});
