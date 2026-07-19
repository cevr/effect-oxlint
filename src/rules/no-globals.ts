/** Ban ambient runtime capabilities that have direct Effect replacements. */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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

const isUnshadowedGlobal = (
  ctx: RuleContext["Service"],
  node: ESTree.Node,
  name: string,
): boolean =>
  Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), name), {
    onNone: () => true,
    onSome: (variable) => variable.defs.length === 0,
  });

const staticMember = (
  node: ESTree.MemberExpression,
): readonly [object: string, property: string] | undefined =>
  Option.getOrUndefined(AST.memberNames(node));

const isCryptoDigest = (node: ESTree.MemberExpression): boolean => {
  if (node.computed || node.property.type !== "Identifier" || node.property.name !== "digest") {
    return false;
  }
  const object = node.object;
  if (object.type !== "MemberExpression" || object.computed) return false;
  return (
    object.object.type === "Identifier" &&
    object.object.name === "crypto" &&
    object.property.type === "Identifier" &&
    object.property.name === "subtle"
  );
};

export const noGlobals = Rule.define({
  name: "no-globals",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid ambient runtime capabilities that Effect provides as services.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const report = (node: ESTree.Node, used: string, alternative: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Avoid ${used}. Use ${alternative}; platform adapters may disable this rule explicitly.`,
        }),
      );

    return {
      MemberExpression: (node) => {
        const memberExpression = Option.getOrUndefined(AST.narrow(node, "MemberExpression"));
        if (memberExpression === undefined) return Effect.void;
        if (
          isCryptoDigest(memberExpression) &&
          isUnshadowedGlobal(ctx, memberExpression, "crypto")
        ) {
          return report(memberExpression, "crypto.subtle.digest", "Crypto.digest");
        }

        const names = staticMember(memberExpression);
        if (names === undefined) return Effect.void;
        const [object, property] = names;
        if (!isUnshadowedGlobal(ctx, memberExpression, object)) return Effect.void;

        for (const [bannedObject, properties, alternative] of memberBans) {
          if (object === bannedObject && properties.has(property)) {
            return report(memberExpression, `${object}.${property}`, alternative);
          }
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        const call = Option.getOrUndefined(AST.narrow(node, "CallExpression"));
        if (call === undefined) return Effect.void;
        const name = Option.getOrUndefined(AST.calleeName(call));
        if (name === undefined || !isUnshadowedGlobal(ctx, call, name)) return Effect.void;
        const alternative = callBans.get(name);
        return alternative === undefined ? Effect.void : report(call, `${name}()`, alternative);
      },
      NewExpression: (node) => {
        const expression = Option.getOrUndefined(AST.narrow(node, "NewExpression"));
        if (expression === undefined || expression.callee.type !== "Identifier") {
          return Effect.void;
        }
        const name = expression.callee.name;
        if (!isUnshadowedGlobal(ctx, expression, name)) return Effect.void;
        const alternative = constructorBans.get(name);
        return alternative === undefined
          ? Effect.void
          : report(expression, `new ${name}()`, alternative);
      },
    };
  },
});
