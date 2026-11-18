/**
 * A context has no silent default.
 *
 * Reported: `createContext({ … })` (also `React.createContext`) whose default
 * object has a function member (a method, an arrow or a function), outside
 * test modules. A component rendered without the provider then calls no-op
 * functions and the bug is silent. Source: the react skill,
 * `server-state.md` "A missing provider throws from the accessor" (catalog
 * SR-R25).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isFunction } from "./_anti-slop-effect.js";
import { isReactCall } from "./_react.js";
import { isTestModule, skipFile } from "./_test-files.js";

const hasFunctionMember = (node: ESTree.Node): boolean =>
  node.type === "ObjectExpression" &&
  node.properties.some(
    (property) => property.type === "Property" && isFunction(property.value),
  );

export const noSilentContextDefault = Rule.define({
  name: "no-silent-context-default",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Create a context with no default (null) and an accessor that throws outside its provider, not a default object of no-op functions.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        const silent =
          isReactCall(node, "createContext") &&
          Option.exists(Option.fromNullishOr(node.arguments[0]), hasFunctionMember);
        if (!silent) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "This context's default holds functions, so a component rendered outside the provider calls stand-ins and the missing provider goes unnoticed. Create it with `createContext<Value | null>(null)` and read it through an accessor that throws when the value is null: `const useNotes = () => { const value = use(NotesContext); if (value === null) throw new Error(\"useNotes outside NotesProvider\"); return value }`.",
          }),
        );
      },
    };
  },
});
