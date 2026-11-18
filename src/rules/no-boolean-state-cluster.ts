/**
 * Three or more boolean states in one component are one union.
 *
 * Reported: a component with three or more `useState` pairs whose initial
 * value is `true` or `false`. Together they allow 2^k combinations, most of
 * which the component never means (open and closing at once); one state of
 * a union type names the modes that exist. Reported once, on the first of
 * them. Test modules are skipped. Source: the react skill,
 * `state-modeling.md` "No Boolean Explosions" (catalog SR-R06).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { componentsIn } from "./_react.js";
import type { Component, StatePair } from "./_react.js";
import { isTestModule, skipFile } from "./_test-files.js";

const isBooleanState = (pair: StatePair): boolean =>
  Option.exists(
    pair.initial,
    (initial) => initial.type === "Literal" && (initial.value === true || initial.value === false),
  );

export const noBooleanStateCluster = Rule.define({
  name: "no-boolean-state-cluster",
  meta: Rule.meta({
    type: "suggestion",
    description: "Model three or more boolean states of one component as one state of a union type.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (component: Component) => {
      const flags = component.states.filter(isBooleanState);
      if (flags.length < 3) return Effect.void;
      return Option.match(Arr.head(flags), {
        onNone: () => Effect.void,
        onSome: (first) =>
          ctx.report(
            Diagnostic.make({
              node: first.declarator,
              message: `\`${component.name}\` keeps ${flags.length} boolean states (${flags.map((flag) => `\`${flag.value}\``).join(", ")}), which allow ${2 ** flags.length} combinations, most of them modes the component never means. Name the modes in one state: \`type Drawer = "closed" | "opening" | "open" | "closing"; const [drawer, setDrawer] = useState<Drawer>("closed")\`.`,
            }),
          ),
      });
    };
    return {
      Program: (node: ESTree.Program) =>
        Effect.forEach(componentsIn(node), check, { discard: true }),
    };
  },
});
