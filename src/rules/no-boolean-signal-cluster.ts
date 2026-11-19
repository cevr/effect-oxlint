/**
 * Three or more boolean signals in one Solid component are one union.
 *
 * Reported: a Solid component with three or more `createSignal` pairs whose
 * initial value is `true` or `false`. Together they allow 2^k combinations,
 * most of which the component never means (busy and done at once); one
 * signal of a union type names the modes that exist. Reported once, on the
 * first of them. Test modules are skipped. The Solid form of
 * `noBooleanStateCluster`. Source: the react skill, `state-modeling.md` "No
 * Boolean Explosions", translated by `ui/platforms/web/solid.md` (catalog
 * SR-R06).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import type { Component, StatePair } from "./_react.js";
import { solidComponentsIn } from "./_solid.js";
import { isTestModule, skipFile } from "./_test-files.js";

const isBooleanSignal = (pair: StatePair): boolean =>
  Option.exists(
    pair.initial,
    (initial) => initial.type === "Literal" && (initial.value === true || initial.value === false),
  );

export const noBooleanSignalCluster = Rule.define({
  name: "no-boolean-signal-cluster",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Model three or more boolean signals of one Solid component as one signal of a union type.",
    docs: { recommended: false, preset: "skills-solid" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (component: Component) => {
      const flags = component.states.filter(isBooleanSignal);
      if (flags.length < 3) return Effect.void;
      return Option.match(Arr.head(flags), {
        onNone: () => Effect.void,
        onSome: (first) =>
          ctx.report(
            Diagnostic.make({
              node: first.declarator,
              message: `\`${component.name}\` keeps ${flags.length} boolean signals (${flags.map((flag) => `\`${flag.value}\``).join(", ")}), which allow ${2 ** flags.length} combinations, most of them modes the component never means. Name the modes in one signal: \`type Download = "idle" | "busy" | "failed" | "done"; const [download, setDownload] = createSignal<Download>("idle")\`.`,
            }),
          ),
      });
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(solidComponentsIn(program), check, { discard: true }),
    };
  },
});
