/**
 * Ban ambient runtime capabilities that have direct Effect replacements.
 *
 * The rule starts at each read of a global that no binding shadows and
 * follows the value: through the global object (`globalThis`, `self`,
 * `window`, `global`), static and computed string members (`process["env"]`),
 * `as`/`!`/`satisfies`/`?.` wrappers, and each alias or destructure
 * (`const { env } = process`, `const D = Date; new D()`), nested ones too,
 * while every write to the alias stores the same global. A value that leaves
 * its sight (an argument, a return) is a use only of a global the `members`
 * option bans whole. `typeof` probes and type positions are not uses.
 *
 * The `members` option bans more members of a global, on top of the built-in
 * list: `{ "Bun": { "use": "an Effect platform service" } }` bans every
 * member of `Bun`, and `{ "process": { "properties": ["cwd", "pid"], "use":
 * "..." } }` bans the listed ones. A project exempts its adapter files with
 * an override that turns the rule off, or configures it without the option to
 * keep only the built-in list there. `builtins: false` drops the built-in
 * list and keeps only the `members` bans: a plain script may use `console`
 * and `process.env`, while `{ "builtins": false, "members": { "Bun": {
 * "properties": ["Glob"], "use": "..." } } }` still holds `Bun.Glob` in
 * every spelling.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { globalObject, globalValueVisitor, type Held } from "./_global-values.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

const MemberOption = Schema.Struct({
  properties: Schema.optionalKey(Schema.Array(Schema.String)),
  use: Schema.String,
});

const Options = Schema.UndefinedOr(
  Schema.Struct({
    builtins: Schema.optionalKey(Schema.Boolean),
    members: Schema.optionalKey(
      Schema.Record(Schema.String, Schema.Union([MemberOption, Schema.Array(MemberOption)])),
    ),
  }),
);

type MemberOption = typeof MemberOption.Type;

const memberOptionJsonSchema = {
  type: "object",
  properties: {
    properties: { type: "array", items: { type: "string" } },
    use: { type: "string" },
  },
  required: ["use"],
  additionalProperties: false,
};

type MemberBan = readonly [object: string, properties: ReadonlySet<string>, alternative: string];

const memberBans: ReadonlyArray<MemberBan> = [
  [
    "console",
    new Set(["debug", "error", "info", "log", "trace", "warn"]),
    "Effect logging or Console",
  ],
  ["Date", new Set(["now"]), "Clock or DateTime"],
  ["Math", new Set(["random"]), "Random"],
  ["performance", new Set(["now"]), "Clock.currentTimeNanos"],
  ["crypto", new Set(["getRandomValues", "randomUUID"]), "Crypto"],
  ["JSON", new Set(["parse", "stringify"]), "Schema JSON codecs"],
  [
    "process",
    new Set(["argv", "chdir", "env", "exit", "hrtime", "nextTick", "stderr", "stdin", "stdout"]),
    "Config, Stdio, Clock, or Effect scheduling",
  ],
  [
    "Bun",
    new Set([
      "$",
      "Glob",
      "connect",
      "env",
      "file",
      "listen",
      "nanoseconds",
      "randomUUIDv7",
      "redis",
      "serve",
      "sleep",
      "spawn",
      "spawnSync",
      "stderr",
      "stdin",
      "stdout",
      "write",
    ]),
    "the corresponding Effect platform service",
  ],
  [
    "Deno",
    new Set([
      "args",
      "env",
      "exit",
      "mkdir",
      "open",
      "readDir",
      "readFile",
      "readTextFile",
      "remove",
      "serve",
      "stat",
      "stderr",
      "stdin",
      "stdout",
      "writeFile",
      "writeTextFile",
    ]),
    "the corresponding Effect platform service",
  ],
  ["localStorage", new Set(["clear", "getItem", "key", "removeItem", "setItem"]), "KeyValueStore"],
  [
    "sessionStorage",
    new Set(["clear", "getItem", "key", "removeItem", "setItem"]),
    "KeyValueStore",
  ],
];

const callBans = new Map([
  ["atob", "Encoding.decodeBase64"],
  ["btoa", "Encoding.encodeBase64"],
  ["fetch", "HttpClient"],
  ["queueMicrotask", "Effect scheduling"],
  ["setImmediate", "Effect scheduling"],
  ["setInterval", "Effect.sleep with Schedule"],
  ["setTimeout", "Effect.sleep or Schedule"],
]);

const constructorBans = new Map([
  ["Date", "Clock or DateTime"],
  ["SharedWorker", "Effect Worker"],
  ["WebSocket", "Socket"],
  ["Worker", "Effect Worker"],
]);

/** The Web Crypto `subtle` object, followed so `crypto.subtle.digest` is read. */
const cryptoSubtle: Held = "crypto.subtle";

const processStreams = new Set(["stderr", "stdin", "stdout"]);

// No Effect service exposes TTY detection, so capability probes stay allowed
// while every operational use of the streams remains banned.
const isTtyRead = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  if (node.type !== "MemberExpression" || parent?.type !== "MemberExpression") return false;
  if (parent.computed) return false;
  return (
    parent.object === node &&
    parent.property.type === "Identifier" &&
    parent.property.name === "isTTY"
  );
};

export const noGlobals = Rule.define({
  name: "no-globals",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid ambient runtime capabilities that Effect provides as services.",
    schema: [
      {
        type: "object",
        properties: {
          builtins: { type: "boolean" },
          members: {
            type: "object",
            additionalProperties: {
              anyOf: [memberOptionJsonSchema, { type: "array", items: memberOptionJsonSchema }],
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ builtins: true, members: {} }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    /** Each global's configured bans: one, or a list when its members name different replacements. */
    const configuredMembers = new Map<string, ReadonlyArray<MemberOption>>(
      Object.entries(options?.members ?? {}).map(([name, bans]) => [name, [bans].flat()]),
    );
    /** `builtins: false` keeps only the configured bans. */
    const builtins = options?.builtins !== false;
    const activeMemberBans = memberBans.filter(() => builtins);
    const activeCallBans = new Map([...callBans].filter(() => builtins));
    const activeConstructorBans = new Map([...constructorBans].filter(() => builtins));
    /** The replacement the first configured ban covering `object.property` names, if one does. */
    const configuredBan = (object: string, property: string): Option.Option<string> =>
      Option.map(
        Option.fromUndefinedOr(
          (configuredMembers.get(object) ?? []).find((ban) =>
            Option.match(Option.fromUndefinedOr(ban.properties), {
              onNone: () => true,
              onSome: (listed) => listed.includes(property),
            }),
          ),
        ),
        (ban) => ban.use,
      );
    /** A global every member of which the configuration bans: `{ "Bun": { "use": "..." } }`. */
    const wholeBan = (name: string): Option.Option<string> =>
      Option.map(
        Option.fromUndefinedOr(
          (configuredMembers.get(name) ?? []).find((ban) => Predicate.isUndefined(ban.properties)),
        ),
        (ban) => ban.use,
      );
    /**
     * The replacement for `object.property`: the configuration first, since it
     * names the project's own replacement, then the built-in list.
     */
    const memberBan = (object: string, property: string): Option.Option<string> =>
      Option.orElse(configuredBan(object, property), () => {
        for (const [bannedObject, properties, alternative] of activeMemberBans) {
          if (object === bannedObject && properties.has(property)) return Option.some(alternative);
        }
        return Option.none();
      });
    /** The replacement for calling or constructing `held`: a whole ban first, then the built-in list. */
    const usedWhole = (held: Held, builtIn: ReadonlyMap<string, string>): Option.Option<string> =>
      Option.orElse(wholeBan(held), () => Option.fromUndefinedOr(builtIn.get(held)));
    /** The names the rule watches: every one it bans a use, a member, a call or a `new` of. */
    const watched = new Set([
      ...activeMemberBans.map(([object]) => object),
      ...activeCallBans.keys(),
      ...activeConstructorBans.keys(),
      ...configuredMembers.keys(),
    ]);

    const report = (node: ESTree.Node, used: string, alternative: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Avoid ${used}. Use ${alternative}; platform adapters may disable this rule explicitly.`,
        }),
      );

    /** A value that leaves the rule's sight is a use only of a wholly banned global. */
    const reportEscape = (node: ESTree.Node, held: Held): Effect.Effect<void> =>
      Option.match(wholeBan(held), {
        onNone: () => Effect.void,
        onSome: (alternative) => report(node, held, alternative),
      });

    /**
     * A watched value kept where the walk cannot follow it (`{ w: window }`,
     * `[document]`, `() => performance`): its banned members are out of sight
     * from there on, so the hold is the use. Handing it to a call stays an
     * escape, since that is how an adapter is built over it.
     */
    const reportHold = (node: ESTree.Node, held: Held): Effect.Effect<void> => {
      if (held !== globalObject && held !== cryptoSubtle && !watched.has(held)) {
        return Effect.void;
      }
      return ctx.report(
        Diagnostic.make({
          node,
          message: `Avoid holding ${held} where this rule cannot follow it. Reach it by its own name, or hand it to an adapter; platform adapters may disable this rule explicitly.`,
        }),
      );
    };

    return globalValueVisitor(ctx, {
      names: watched,
      memberValue: (owner, name) =>
        Option.liftPredicate(
          cryptoSubtle,
          () => builtins && owner === "crypto" && name === "subtle",
        ),
      member: (node, owner, name) => {
        if (owner === cryptoSubtle) {
          if (name === "digest") return report(node, "crypto.subtle.digest", "Crypto.digest");
          return Effect.void;
        }
        return Option.match(memberBan(owner, name), {
          onNone: () => Effect.void,
          onSome: (alternative) => {
            if (owner === "process" && processStreams.has(name) && isTtyRead(node)) {
              return Effect.void;
            }
            return report(node, `${owner}.${name}`, alternative);
          },
        });
      },
      call: (node, held) =>
        Option.match(usedWhole(held, activeCallBans), {
          onNone: () => Effect.void,
          onSome: (alternative) => report(node, `${held}()`, alternative),
        }),
      construct: (node, held) =>
        Option.match(usedWhole(held, activeConstructorBans), {
          onNone: () => Effect.void,
          onSome: (alternative) => report(node, `new ${held}()`, alternative),
        }),
      rest: (node, held, follow) =>
        Option.match(wholeBan(held), {
          onNone: () => follow,
          onSome: (alternative) => report(node, `...${held}`, alternative),
        }),
      hold: (node, held) =>
        Option.match(wholeBan(held), {
          onNone: () => reportHold(node, held),
          onSome: (alternative) => report(node, held, alternative),
        }),
      escape: reportEscape,
    });
  },
});
