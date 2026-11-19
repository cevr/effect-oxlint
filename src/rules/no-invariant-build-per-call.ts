/**
 * Build a reusable value once, not on every call.
 *
 * Reported, inside a function and outside test modules, when a known builder
 * of a reusable, immutable or stateless value is called with arguments that
 * are the same on every call (literals, and names bound outside every
 * enclosing function): hoisting it to module scope gives the same behaviour
 * and builds it once. The builders are a table, the rule's `builders`
 * option, so a project adds its own:
 *
 * - `Intl.NumberFormat`, a dotted callee, called or constructed; a last
 *   segment ending in `*` matches by prefix (`Schema.decode*`).
 * - `.toLocaleString/1`, a method on any receiver, given at least that many
 *   arguments.
 * - `class Schema.Class`, a class declared inside a function whose
 *   superclass is a call of the builder (`class A extends Schema.Class<A>("A")({…})`).
 *
 * The defaults cover `Intl` formatters, `toLocale…` given a locale or
 * options, `new RegExp` from a constant, `TextEncoder`, `TextDecoder`,
 * `URLPattern`, Effect `Schema` decoders, encoders and guards, `JSONSchema.make`,
 * `Layer` constructors (a layer built per call is a new layer, so it is not
 * shared) and `Schema` and `Data` classes. Mutable or identity-bearing values
 * (`Map`, `Set`, `Date`, `Error`, arrays, objects, `Ref`, `Queue`) are never
 * builders: two calls must get two of them.
 *
 * Measured (instructions per call, bun and node, the bite-lab BL-PERF bench):
 * see the README row.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { staticMemberName } from "./_global-values.js";
import { constantArguments, enclosingFunctions } from "./_per-call.js";
import { isTestModule, skipFile } from "./_test-files.js";

const defaultBuilders: ReadonlyArray<string> = [
  "Intl.NumberFormat",
  "Intl.DateTimeFormat",
  "Intl.RelativeTimeFormat",
  "Intl.PluralRules",
  "Intl.ListFormat",
  "Intl.DisplayNames",
  "Intl.Segmenter",
  "Intl.Collator",
  ".toLocaleString/2",
  ".toLocaleDateString/2",
  ".toLocaleTimeString/2",
  "TextEncoder",
  "TextDecoder",
  "URLPattern",
  "Schema.decode*",
  "Schema.encode*",
  "Schema.validate*",
  "Schema.is",
  "Schema.asserts",
  "JSONSchema.make",
  "Layer.succeed",
  "Layer.sync",
  "Layer.effect",
  "Layer.effectDiscard",
  "Layer.scoped",
  "class Schema.Class",
  "class Schema.TaggedClass",
  "class Schema.TaggedError",
  "class Schema.ErrorClass",
  "class Data.Class",
  "class Data.TaggedClass",
  "class Data.Error",
  "class Data.TaggedError",
];

/** One row of the table, parsed. */
type Builder =
  | { readonly form: "call"; readonly entry: string; readonly path: string; readonly prefix: boolean }
  | { readonly form: "method"; readonly entry: string; readonly name: string; readonly minArgs: number }
  | { readonly form: "class"; readonly entry: string; readonly path: string; readonly prefix: boolean };

const parse = (entry: string): Builder => {
  const method = /^\.([\w$]+)(?:\/(\d+))?$/u.exec(entry);
  if (method) return { form: "method", entry, name: method[1] ?? "", minArgs: Number(method[2] ?? "0") };
  const klass = /^class\s+(.+)$/u.exec(entry);
  const target = klass?.[1] ?? entry;
  const prefix = target.endsWith("*");
  const path = target.replace(/\*$/u, "");
  if (klass) return { form: "class", entry, path, prefix };
  return { form: "call", entry, path, prefix };
};

/** `Intl.NumberFormat` for that callee; `globalThis.` is dropped. */
const dottedPath = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  if (node.type !== "MemberExpression") return Option.none();
  return Option.flatMap(staticMemberName(node), (name) =>
    Option.map(dottedPath(node.object), (owner) =>
      [owner].filter((o) => o !== "globalThis").concat(name).join("."),
    ),
  );
};

/** The static member a callee reads (`x.toLocaleString`), if it reads one. */
const memberName = (callee: ESTree.Node): Option.Option<string> => {
  if (callee.type !== "MemberExpression") return Option.none();
  return staticMemberName(callee);
};

const pathMatches = (builder: { readonly path: string; readonly prefix: boolean }, path: string) =>
  (builder.prefix && path.startsWith(builder.path)) || path === builder.path;

/** A class's superclass call chain (`Schema.Class<A>("A")({…})`): its root callee and every argument. */
const superCall = (
  node: ESTree.Node,
): Option.Option<{ readonly root: ESTree.Node; readonly args: ReadonlyArray<ESTree.Node> }> => {
  if (node.type !== "CallExpression") return Option.none();
  const inner = superCall(node.callee);
  return Option.match(inner, {
    onNone: () => Option.some({ root: node.callee, args: node.arguments }),
    onSome: (chain) => Option.some({ root: chain.root, args: [...chain.args, ...node.arguments] }),
  });
};

const Options = Schema.UndefinedOr(
  Schema.Struct({
    builders: Schema.optionalKey(Schema.Array(Schema.String)),
    replaceDefaults: Schema.optionalKey(Schema.Boolean),
  }),
);

const message = (shown: string, entry: string) =>
  `\`${shown}\` builds the same value on every call: its arguments do not change between calls (builder \`${entry}\`). Build it once at module scope (\`const built = ${shown}\`) and reuse it here; ${remedy(entry)}`;

const remedy = (entry: string): string => {
  if (entry.startsWith("Intl.") || entry.startsWith(".toLocale")) {
    return "for a formatter, call `formatter.format(value)` on the one built once (`new Intl.NumberFormat(locale, options)`).";
  }
  if (entry === "RegExp") return "or write it as a literal (`/…/flags`), whose source the engine compiles once.";
  if (entry.startsWith("Layer.")) return "a layer built per call is a new layer each time, so its resources are not shared.";
  if (entry.startsWith("class ")) return "a class declared per call is a new class each time, so `instanceof` and equality across calls fail.";
  return "the hoisted value is immutable or stateless, so every call can share it.";
};

export const noInvariantBuildPerCall = Rule.define({
  name: "no-invariant-build-per-call",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Build a reusable, immutable value (an Intl formatter, a RegExp, a Schema decoder, a Layer) once at module scope instead of on every call from the same arguments.",
    docs: { recommended: false, preset: "skills-perf" },
    schema: [
      {
        type: "object",
        properties: {
          builders: { type: "array", items: { type: "string" } },
          replaceDefaults: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ builders: [], replaceDefaults: false }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const own = options?.builders ?? [];
    const defaults = defaultBuilders.filter(() => options?.replaceDefaults !== true);
    const table = [...defaults, ...own].map(parse);
    const calls = table.filter((b) => b.form === "call");
    const methods = table.filter((b) => b.form === "method");
    const classes = table.filter((b) => b.form === "class");

    const perCall = (node: ESTree.Node, args: ReadonlyArray<ESTree.Node>): boolean => {
      const functions = enclosingFunctions(node);
      return functions.length > 0 && constantArguments(args, functions);
    };
    const report = (node: ESTree.Node, entry: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: message(ctx.sourceCode.getText(node).split("\n")[0]?.slice(0, 60) ?? "", entry),
        }),
      );

    const built = (node: ESTree.CallExpression | ESTree.NewExpression): Option.Option<string> => {
      const callee = node.callee;
      const byPath = Option.flatMap(dottedPath(callee), (path) =>
        Option.map(
          Option.fromNullishOr(calls.find((b) => pathMatches(b, path))),
          (b) => b.entry,
        ),
      );
      const byMethod = Option.flatMap(memberName(callee), (name) =>
        Option.map(
          Option.fromNullishOr(
            methods.find((b) => b.name === name && node.arguments.length >= b.minArgs),
          ),
          (b) => b.entry,
        ),
      );
      return Option.filter(Option.orElse(byPath, () => byMethod), () => perCall(node, node.arguments));
    };
    const check = (node: ESTree.CallExpression | ESTree.NewExpression) =>
      Option.match(built(node), { onNone: () => Effect.void, onSome: (entry) => report(node, entry) });
    const checkClass = (node: ESTree.Class) =>
      Option.match(
        Option.flatMap(Option.flatMap(Option.fromNullishOr(node.superClass), superCall), (chain) =>
          Option.flatMap(dottedPath(chain.root), (path) =>
            Option.filter(
              Option.map(
                Option.fromNullishOr(classes.find((b) => pathMatches(b, path))),
                (b) => b.entry,
              ),
              () => perCall(node, chain.args),
            ),
          ),
        ),
        { onNone: () => Effect.void, onSome: (entry) => report(node, entry) },
      );
    return {
      NewExpression: check,
      CallExpression: check,
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});
