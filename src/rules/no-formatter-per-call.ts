/**
 * Build an `Intl` formatter once, not on every call.
 *
 * Reported, inside a function and outside test modules, when every argument
 * is the same on every call (literals, and names bound outside the function):
 * `new Intl.NumberFormat(…)`, `DateTimeFormat`, `RelativeTimeFormat`,
 * `PluralRules`, `ListFormat`, `DisplayNames` or `Segmenter` (with or without
 * `new`), and `x.toLocaleString(…)`, `toLocaleDateString(…)` or
 * `toLocaleTimeString(…)` given a locale or options, which builds such a
 * formatter inside each call. Not reported: a formatter at module scope, one
 * whose locale or options read a parameter or a local, and a `toLocale…`
 * call with no arguments (the engine keeps the default formatter).
 *
 * Measured (instructions per call, bun 1.4.4 and node 24.11.1, the bite-lab
 * BL-PERF bench): a formatter built per call costs one to two orders of
 * magnitude more than `format` on a formatter built once.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { staticMemberName } from "./_global-values.js";
import { constantArguments, enclosingFunctions } from "./_per-call.js";
import { isTestModule, skipFile } from "./_test-files.js";

const formatters: ReadonlySet<string> = new Set([
  "NumberFormat",
  "DateTimeFormat",
  "RelativeTimeFormat",
  "PluralRules",
  "ListFormat",
  "DisplayNames",
  "Segmenter",
]);

const localeMethods: ReadonlySet<string> = new Set([
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
]);

const isIntl = (node: ESTree.Node): boolean =>
  (node.type === "Identifier" && node.name === "Intl") ||
  (node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "globalThis" &&
    Option.contains(staticMemberName(node), "Intl"));

/** The static member a callee reads (`x.toLocaleString`), if it reads one. */
const memberName = (callee: ESTree.Node): Option.Option<string> => {
  if (callee.type !== "MemberExpression") return Option.none();
  return staticMemberName(callee);
};

/** `Intl.NumberFormat` and the other formatters: the constructor's name. */
const formatterName = (callee: ESTree.Node): Option.Option<string> => {
  if (callee.type !== "MemberExpression" || !isIntl(callee.object)) return Option.none();
  return Option.filter(staticMemberName(callee), (name) => formatters.has(name));
};

export const noFormatterPerCall = Rule.define({
  name: "no-formatter-per-call",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Build an Intl formatter once at module scope instead of on every call (new Intl.NumberFormat, toLocaleString with a locale or options).",
    docs: { recommended: false, preset: "skills-perf" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const perCall = (node: ESTree.CallExpression | ESTree.NewExpression): boolean => {
      const functions = enclosingFunctions(node);
      return functions.length > 0 && constantArguments(node.arguments, functions);
    };
    const reportBuilt = (node: ESTree.Node, built: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `\`${built}\` builds an Intl formatter (locale data, option resolution) on every call, with the same arguments each time. Build it once at module scope (\`const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })\`) and call \`money.format(value)\` here.`,
        }),
      );
    const keyword = { NewExpression: "new ", CallExpression: "" } as const;
    const constructed = (node: ESTree.CallExpression | ESTree.NewExpression) =>
      Option.match(
        Option.filter(formatterName(node.callee), () => perCall(node)),
        {
          onNone: () => Effect.void,
          onSome: (name) => reportBuilt(node, `${keyword[node.type]}Intl.${name}(…)`),
        },
      );
    return {
      NewExpression: constructed,
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(
          Option.filter(memberName(node.callee), (name) => localeMethods.has(name)),
          {
            onNone: () => constructed(node),
            onSome: (name) =>
              Option.match(
                Option.liftPredicate(node, (call) => call.arguments.length > 0 && perCall(call)),
                { onNone: () => Effect.void, onSome: (call) => reportBuilt(call, `.${name}(…)`) },
              ),
          },
        ),
    };
  },
});
