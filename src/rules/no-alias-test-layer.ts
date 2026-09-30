/**
 * Ban an alternative layer static that is only the live layer under another name.
 *
 * `static Test = Service.Live` (or `static layerTest = Service.layer`, or a
 * thunk returning either) adds a seam with nothing behind it: callers choose
 * between two names for one implementation, and a reader must open the file
 * to learn they are the same. An alternative layer earns its name only when it
 * is a different implementation; otherwise callers use the live layer.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

/** Static names that claim an alternative implementation. */
const alternativeName = /^(?:layer)?(?:Test|Fake|Stub|Mock)$/u;

/** Static names that hold the live implementation. */
const liveNames = new Set(["Live", "layer"]);

/** `Service.Live`, `this.layer`, or a thunk that returns one: the live layer reached by name. */
const liveReference = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "ArrowFunctionExpression" && node.expression) {
    return liveReference(node.body);
  }
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier" ||
    !liveNames.has(node.property.name)
  ) {
    return Option.none();
  }
  if (node.object.type === "ThisExpression") return Option.some(`this.${node.property.name}`);
  if (node.object.type !== "Identifier") return Option.none();
  return Option.some(`${node.object.name}.${node.property.name}`);
};

export const noAliasTestLayer = Rule.define({
  name: "no-alias-test-layer",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Ban a Test, Fake, Stub, or Mock layer static that only returns the live layer under another name.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      PropertyDefinition: (node: ESTree.PropertyDefinition) => {
        if (
          !node.static ||
          node.computed ||
          node.key.type !== "Identifier" ||
          !alternativeName.test(node.key.name) ||
          !node.value
        ) {
          return Effect.void;
        }
        const name = node.key.name;
        return Option.match(liveReference(node.value), {
          onNone: () => Effect.void,
          onSome: (live) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`static ${name}\` returns \`${live}\` unchanged. An alternative layer earns its name only as a different implementation; delete it and use the live layer.`,
              }),
            ),
        });
      },
    };
  },
});
