/**
 * Ban the global Promise constructor and its static APIs.
 *
 * The rule follows the global `Promise` wherever its value goes, as
 * `noGlobals` follows the globals it bans: through the global object
 * (`new globalThis.Promise()`, `globalThis["Promise"]`), wrappers, aliases
 * (`const P = Promise; new P()`) and destructures
 * (`const { resolve } = Promise`). It reports `new Promise()`, a call of
 * `Promise()`, and a call of a static member (`Promise.all([])`). A local
 * binding named `Promise`, type positions and `instanceof` checks are not
 * uses.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { globalValueVisitor, type Held } from "./_global-values.js";

const promise: Held = "Promise";

/** The value of a static member of `Promise`: `Promise.all` holds `Promise.all`. */
const staticMember = (owner: Held, name: string): Option.Option<Held> =>
  Option.liftPredicate(`${promise}.${name}`, () => owner === promise);

const isPromiseApi = (held: Held): boolean =>
  held === promise ||
  (held.startsWith(`${promise}.`) && !held.slice(promise.length + 1).includes("."));

export const noNewPromise = Rule.define({
  name: "no-new-promise",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid Promise APIs. Use Effect concurrency and promise boundaries.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      ctx.report(
        Diagnostic.make({
          node,
          message:
            "Avoid Promise APIs. Use Effect.async for callbacks and Effect.promise or Effect.tryPromise at promise boundaries.",
        }),
      );

    return globalValueVisitor(ctx, {
      names: new Set([promise]),
      memberValue: staticMember,
      member: () => Effect.void,
      call: (node, held) => {
        if (!isPromiseApi(held)) return Effect.void;
        return report(node);
      },
      construct: (node, held) => {
        if (held !== promise) return Effect.void;
        return report(node);
      },
      rest: (_node, _held, follow) => follow,
      escape: () => Effect.void,
    });
  },
});
