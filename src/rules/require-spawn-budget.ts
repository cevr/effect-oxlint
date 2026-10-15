/**
 * A test that spawns a process names its timeout.
 *
 * A spawn is a cold start whose time is the machine's, not the test's: a CLI
 * spawn takes under a second idle and has taken past a runner's 5 s default
 * while sibling suites loaded every core. Give the test its budget in
 * milliseconds after its body (`it.effect(name, body, 20_000)`), or as
 * `{ timeout }` in its options, before the body (Vitest's
 * `it(name, { timeout }, body)`) or after it.
 *
 * A test is a call of a runner's `it` or `test` (`bun:test`'s,
 * `effect-bun-test`'s, `vitest`'s, `@effect/vitest`'s or the global one;
 * `it.effect`, `it.live`, `it.effect.layer(…)`) with a name and a body. It
 * starts a process when its body calls the global `Bun`'s `spawn` or
 * `spawnSync` (read off it, or taken apart from it), `spawn` or `spawnSync`
 * imported from `bun`, or a `node:child_process` function. It makes a
 * command when its body calls effect's `ChildProcess.make`, whose command
 * starts a process when it runs; the rule cannot see whether it runs, so the
 * report says so. A function of the same file that does either counts,
 * however deep. Each name is read by its binding: a parameter or a local of
 * the same spelling is none of these, and a helper is the binding its call
 * resolves to.
 *
 * `minimum` (milliseconds, 0 by default) also reports a timeout the rule
 * reads as a number (a literal, or a `const` holding one) below it. A
 * timeout it cannot read passes. A spawn inside a service the test provides
 * is not seen.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { staticProperties } from "./_call-arguments.js";
import { constResolver } from "./_const-bindings.js";
import { memberName, type Module, type NameBindings, nameBindings } from "./_name-bindings.js";

const Options = Schema.UndefinedOr(Schema.Struct({ minimum: Schema.optionalKey(Schema.Number) }));

/** Bun's spawns. */
const bunSpawns: ReadonlyArray<string> = ["spawn", "spawnSync"];

/** Node's process starters. */
const nodeSpawns: ReadonlyArray<string> = [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
];

const isProcess: Module = (from) => from === "effect/process";
const isChildProcess: Module = (from) => from === "effect/process/ChildProcess";
const isBun: Module = (from) => from === "bun";
const isNodeChildProcess: Module = (from) =>
  from === "node:child_process" || from === "child_process";

/** The modules a test is run with: `it` and `test` are theirs. */
const isRunnerModule: Module = (from) =>
  from === "bun:test" ||
  from === "effect-bun-test" ||
  from === "vitest" ||
  from === "@effect/vitest";

/**
 * What a test's body reaches: a call that starts a process (`Bun.spawn`, a
 * `node:child_process` function), or only an effect `ChildProcess` command,
 * which starts one when it runs. A start outranks a command.
 */
type Reach = "start" | "command";

/** The stronger of two reaches: a start outranks a command. */
const stronger = (a: Option.Option<Reach>, b: Option.Option<Reach>): Option.Option<Reach> => {
  if (Option.contains(a, "start") || Option.contains(b, "start")) return Option.some("start");
  return Option.orElse(a, () => b);
};

/** What a report says the test does. */
const what: Record<Reach, string> = {
  start: "This test starts a process",
  command: "This test makes an effect ChildProcess command, which starts a process when it runs,",
};

const message = (reach: Reach) =>
  `${what[reach]} and names no timeout: a cold start's time is the machine's, and a loaded machine runs past the runner's default. Give the test its budget in milliseconds after its body, or as { timeout } in its options.`;

const shortMessage = (reach: Reach, minimum: number, timeout: number) =>
  `${what[reach]} and gives it ${timeout} ms, under the ${minimum} ms a test that starts a process takes: a cold start's time is the machine's. Give it at least ${minimum} ms.`;

/** The node a callee chain starts at: `it` for `it.effect.layer(x)(…)`. */
const rootOf = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  if (node.type === "Identifier") return Option.some(node);
  if (node.type === "MemberExpression") return rootOf(node.object);
  if (node.type === "CallExpression") return rootOf(node.callee);
  return Option.none();
};

const isFunction = (node: ESTree.Node) =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const isIdentifier = (node: ESTree.Node): node is ESTree.IdentifierReference =>
  node.type === "Identifier";

/** Whether a name is the runner's `name`: imported from a runner (or an alias), or the global of that name. */
const isRunner = (bindings: NameBindings, node: ESTree.Node, name: string) =>
  bindings.importsAs(node, isRunnerModule, name) || bindings.isGlobal(node, name);

/** A test: a runner's `it…(name, body, …)` or `test…(name, body, …)`. */
const isTest = (bindings: NameBindings, node: ESTree.Node): node is ESTree.CallExpression =>
  node.type === "CallExpression" &&
  Option.exists(
    rootOf(node.callee),
    (root) => isRunner(bindings, root, "it") || isRunner(bindings, root, "test"),
  ) &&
  node.arguments.some(isFunction);

/** Whether `node` is effect's `ChildProcess` module: `ChildProcess` from `effect/process`, or its module whole. */
const isChildProcessModule = (bindings: NameBindings, node: ESTree.Node): boolean => {
  if (node.type === "MemberExpression")
    return (
      Option.contains(memberName(node), "ChildProcess") &&
      bindings.importsAs(node.object, isProcess, "*")
    );
  return (
    bindings.importsAs(node, isProcess, "ChildProcess") ||
    bindings.importsAs(node, isChildProcess, "*")
  );
};

/** Whether a call starts a process itself: Bun's spawns and `node:child_process`'s. */
const starts = (bindings: NameBindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === "MemberExpression")
    return Option.exists(memberName(callee), (name) => {
      if (nodeSpawns.includes(name) && bindings.importsAs(callee.object, isNodeChildProcess, "*"))
        return true;
      return bunSpawns.includes(name) && bindings.isGlobal(callee.object, "Bun");
    });
  if (callee.type !== "Identifier") return false;
  if (bunSpawns.some((name) => bindings.importsAs(callee, isBun, name))) return true;
  if (nodeSpawns.some((name) => bindings.importsAs(callee, isNodeChildProcess, name))) return true;
  return Option.exists(
    bindings.takenFrom(callee),
    ({ key, value }) => bunSpawns.includes(key) && bindings.isGlobal(value, "Bun"),
  );
};

/** Whether a call makes an effect `ChildProcess` command: `ChildProcess.make`, or `make` imported. */
const makesCommand = (bindings: NameBindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === "MemberExpression")
    return (
      Option.contains(memberName(callee), "make") && isChildProcessModule(bindings, callee.object)
    );
  return bindings.importsAs(callee, isChildProcess, "make");
};

/** What a call reaches itself: a process it starts, a command it makes, or neither. */
const reachOfCall = (bindings: NameBindings, call: ESTree.CallExpression): Option.Option<Reach> => {
  if (starts(bindings, call)) return Option.some("start");
  if (makesCommand(bindings, call)) return Option.some("command");
  return Option.none();
};

/**
 * Whether a declarator names a function: `const f = (…) => …`, or one built
 * by a call, `const f = Effect.fn("f")(function* …)`. A value a test's body
 * binds (`const run = yield* cli(…)`) is not one: its calls are the test's.
 */
const declaresFunction = (declarator: ESTree.VariableDeclarator) =>
  Option.exists(
    Option.fromNullishOr(declarator.init),
    (init) =>
      isFunction(init) || (init.type === "CallExpression" && init.callee.type === "CallExpression"),
  );

/**
 * Where a call is made: the test whose body makes it (its call), or the
 * function of the file it is made in (the name that function is bound to).
 */
const hostOf = (bindings: NameBindings, node: ESTree.Node): Option.Option<ESTree.Node> => {
  for (const ancestor of ancestors(node)) {
    if (isTest(bindings, ancestor)) return Option.some(ancestor);
    if (
      ancestor.type === "VariableDeclarator" &&
      ancestor.id.type === "Identifier" &&
      declaresFunction(ancestor)
    )
      return Option.some(ancestor.id);
    if (ancestor.type === "FunctionDeclaration") return Option.fromNullishOr(ancestor.id);
  }
  return Option.none();
};

/**
 * A call the rule follows: where it is made (`host`), what it reaches
 * itself, and the function of the file it calls (`helper`, the name that
 * function is bound to) when it calls one.
 */
interface Call {
  readonly host: ESTree.Node;
  readonly reach: Option.Option<Reach>;
  readonly helper: Option.Option<ESTree.Node>;
}

/** What a call reaches, given what each helper reaches. */
const reachOf = (call: Call, helpers: ReadonlyMap<ESTree.Node, Reach>): Option.Option<Reach> =>
  stronger(
    call.reach,
    Option.flatMap(call.helper, (helper) => Option.fromUndefinedOr(helpers.get(helper))),
  );

/** What each helper reaches, directly or through one another, by the name each is bound to. */
const helperReaches = (calls: ReadonlyArray<Call>, tests: ReadonlySet<ESTree.Node>) => {
  const helpers = new Map<ESTree.Node, Reach>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const call of calls) {
      if (tests.has(call.host)) continue;
      const known = Option.fromUndefinedOr(helpers.get(call.host));
      const reach = stronger(known, reachOf(call, helpers));
      if (Option.isNone(reach) || Option.contains(known, reach.value)) continue;
      helpers.set(call.host, reach.value);
      grew = true;
    }
  }
  return helpers;
};

/** What a test names as its timeout: none, a number the rule reads, or a value it cannot read. */
const Timeout = Schema.TaggedUnion({
  None: {},
  Read: { ms: Schema.Number },
  Unread: {},
});
type Timeout = typeof Timeout.Type;

const none: Timeout = Timeout.cases.None.make({});
const unread: Timeout = Timeout.cases.Unread.make({});
const read = (ms: number): Timeout => Timeout.cases.Read.make({ ms });

export const requireSpawnBudget = Rule.define({
  name: "require-spawn-budget",
  meta: Rule.meta({
    type: "problem",
    description:
      "Give a test that starts a process, or makes an effect ChildProcess command, its timeout: a cold start's time is the machine's, and a runner's default fails a loaded one.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: { minimum: { type: "number", minimum: 0 } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ minimum: 0 }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const bindings = nameBindings(ctx);
    const resolve = constResolver(ctx);
    const minimum = options?.minimum ?? 0;
    const tests: Array<ESTree.CallExpression> = [];
    const calls: Array<Call> = [];

    /** A timeout as a number the rule reads (a literal, or a `const` holding one), or one it cannot. */
    const timeoutValue = (expression: ESTree.Expression): Timeout => {
      const value = resolve(expression);
      if (value.type === "Literal" && Predicate.isNumber(value.value)) return read(value.value);
      return unread;
    };

    /** What one argument of a test, past its name and body, says of its timeout. */
    const timeoutIn = (argument: ESTree.Argument): Timeout => {
      if (argument.type === "SpreadElement") return unread;
      const value = resolve(argument);
      if (value.type !== "ObjectExpression") return timeoutValue(argument);
      return Option.match(Arr.head(staticProperties(value, "timeout")), {
        onSome: (timeout) => timeoutValue(timeout.value),
        onNone: () => {
          if (value.properties.some((property) => property.type === "SpreadElement")) return unread;
          return none;
        },
      });
    };

    /**
     * The timeout a test names: a number after its body, or `{ timeout }` in
     * its options, before the body (Vitest's `it(name, options, body)`) or
     * after it.
     */
    const timeoutOf = (test: ESTree.CallExpression): Timeout => {
      const body = test.arguments.findIndex(isFunction);
      const named = test.arguments
        .filter((_, at) => at !== body && (at !== 0 || body === 0))
        .map(timeoutIn);
      return Option.getOrElse(
        Arr.findFirst(named, (timeout) => timeout._tag !== "None"),
        () => none,
      );
    };

    /** The report a test that reaches `reach` earns, if any. */
    const findingOf = (
      test: ESTree.CallExpression,
      reach: Reach,
    ): ReadonlyArray<Diagnostic.Diagnostic> =>
      Timeout.match(timeoutOf(test), {
        None: () => [Diagnostic.make({ node: test, message: message(reach) })],
        Read: ({ ms }) => {
          if (ms >= minimum) return [];
          return [Diagnostic.make({ node: test, message: shortMessage(reach, minimum, ms) })];
        },
        Unread: () => [],
      });

    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (isTest(bindings, node)) tests.push(node);
        const helper = Option.flatMap(Option.liftPredicate(node.callee, isIdentifier), (callee) =>
          Option.map(bindings.definitionOf(callee), (definition) => definition.name),
        );
        const reach = reachOfCall(bindings, node);
        const host = hostOf(bindings, node);
        if (Option.isSome(host) && (Option.isSome(reach) || Option.isSome(helper)))
          calls.push({ host: host.value, reach, helper });
        return Effect.void;
      },
      "Program:exit": () => {
        const helpers = helperReaches(calls, new Set(tests));
        /** What a test's body reaches: the strongest reach of the calls it makes. */
        const reachIn = (test: ESTree.CallExpression) =>
          calls
            .filter((call) => call.host === test)
            .reduce<Option.Option<Reach>>(
              (reach, call) => stronger(reach, reachOf(call, helpers)),
              Option.none(),
            );
        return Effect.forEach(
          tests.flatMap((test) =>
            Option.match(reachIn(test), {
              onNone: () => [],
              onSome: (reach) => findingOf(test, reach),
            }),
          ),
          (finding) => ctx.report(finding),
          { discard: true },
        );
      },
    };
  },
});
