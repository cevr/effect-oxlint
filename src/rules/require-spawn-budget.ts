/**
 * A test that spawns a process names its timeout.
 *
 * A spawn is a cold start whose time is the machine's, not the test's: a CLI
 * spawn takes under a second idle and has taken past a runner's 5 s default
 * while sibling suites loaded every core. Give the test its budget in
 * milliseconds after its body (`it.effect(name, body, 20_000)`), or as
 * `{ timeout }` in its options, before the body (Vitest's
 * `it(name, { timeout }, body)`) or after it. A suite's `{ timeout }`
 * (`describe(name, { timeout }, body)`) is its tests' budget too.
 *
 * A test is a call of a runner's `it` or `test` (`bun:test`'s,
 * `effect-bun-test`'s, `vitest`'s, `@effect/vitest`'s or the global one) or
 * one of its members (`it.effect`, `it.live`, `it.skip`, effect-bun-test's
 * `it.effect.layer(…)`), with a function among its arguments, the body. A
 * call through a group, a fixture builder or a hook is not a test: a suite
 * (`describe`, `suite`, `test.describe`), @effect/vitest's layer group
 * (`it.layer(L)(…)`, `layer(L)(…)`), `test.extend` and `test.override`,
 * and the hooks (`beforeAll`, `beforeEach`, `afterAll`, `afterEach`,
 * `aroundAll`, `aroundEach`). A group's factory takes the test API as its
 * first parameter, so a call on that parameter is a runner's call too, and
 * each test inside a group is judged on its own.
 *
 * The report names what the test calls: the global `Bun`'s `spawn` or
 * `spawnSync` (read off it, or taken apart from it), `spawn` or `spawnSync`
 * imported from `bun`, a `node:child_process` function, or effect's
 * `ChildProcess.make`, whose command starts a process when a platform
 * spawner runs it (a test spawner may start none). A function of the same
 * file that leads to one counts, however deep, and the report names it.
 * Each name is read by its binding: a parameter or a local of the same
 * spelling is none of these, and a helper is the binding its call resolves
 * to.
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
import { ancestors, parentOf } from "./_ast-ancestors.js";
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

/** The modules a test is run with. */
const runnerModules: ReadonlyArray<string> = [
  "bun:test",
  "effect-bun-test",
  "vitest",
  "@effect/vitest",
];

/** The names a runner's call starts at: a test, a suite, or @effect/vitest's `layer`. */
const runnerNames: ReadonlyArray<string> = ["it", "test", "describe", "suite", "layer"];

/** The names of a test: its tests are calls of these, or of their members. */
const testNames: ReadonlySet<string> = new Set(["it", "test"]);

/** The suites: their tests take the suite's `{ timeout }`. */
const suiteNames: ReadonlySet<string> = new Set(["describe", "suite"]);

/** A runner's members that make no test: fixture builders and hooks. */
const notTests: ReadonlySet<string> = new Set([
  "extend",
  "override",
  "beforeAll",
  "beforeEach",
  "afterAll",
  "afterEach",
  "aroundAll",
  "aroundEach",
]);

/**
 * What a test's body reaches: a call that starts a process (`Bun.spawn`, a
 * `node:child_process` function), or only an effect `ChildProcess` command.
 * `callee` is the call as the code writes it (`Bun.spawnSync`); `via`, the
 * function of the file the test calls to reach it. A start outranks a command.
 */
interface Reach {
  readonly kind: "start" | "command";
  readonly callee: string;
  readonly via: Option.Option<string>;
}

/** The stronger of two reaches: a start outranks a command, and the first outranks a later one. */
const stronger = (a: Option.Option<Reach>, b: Option.Option<Reach>): Option.Option<Reach> => {
  if (Option.exists(a, (reach) => reach.kind === "start")) return a;
  if (Option.exists(b, (reach) => reach.kind === "start")) return b;
  return Option.orElse(a, () => b);
};

/** What the test was seen to call: the call, or the function of the file that leads to it. */
const seen = (reach: Reach) =>
  Option.match(reach.via, {
    onNone: () => `\`${reach.callee}\``,
    onSome: (via) => `\`${via}\`, which leads to a call of \`${reach.callee}\`,`,
  });

/** Why a test that reaches a call of this kind wants a budget. */
const why: Record<Reach["kind"], string> = {
  start:
    "starting a process takes the machine's time, and a loaded machine can run past the runner's default",
  command:
    "the command starts a process when a platform spawner runs it, and starting a process takes the machine's time, so a loaded machine can run past the runner's default",
};

const message = (reach: Reach) =>
  `This test calls ${seen(reach)} and names no timeout: ${why[reach.kind]}. Give the test its budget in milliseconds after its body, or as { timeout } in its options.`;

/** Who gives the test its budget: the test, or its suite. */
const giver: Record<Giver, string> = { own: "gives it", suite: "its suite gives it" };

const shortMessage = (reach: Reach, minimum: number, budget: Budget) =>
  `This test calls ${seen(reach)} and ${giver[budget.from]} ${budget.ms} ms, under the ${minimum} ms minimum this project sets. Give it at least ${minimum} ms.`;

const isFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const isIdentifier = (node: ESTree.Node): node is ESTree.IdentifierReference =>
  node.type === "Identifier";

/** One step of a callee chain after its root: a member read (`.effect`), or a call (`layer(L)`). */
type Step = { readonly member: string } | "call";

/** A callee chain: the name it starts at and its steps; `it`, `.effect`, `.layer`, a call for `it.effect.layer(x)`. */
interface Chain {
  readonly root: ESTree.IdentifierReference;
  readonly steps: ReadonlyArray<Step>;
}

const chainOf = (node: ESTree.Node): Option.Option<Chain> => {
  if (isIdentifier(node)) return Option.some({ root: node, steps: [] });
  if (node.type === "MemberExpression")
    return Option.flatMap(memberName(node), (member) =>
      Option.map(chainOf(node.object), (chain) => ({
        root: chain.root,
        steps: [...chain.steps, { member }],
      })),
    );
  if (node.type === "CallExpression")
    return Option.map(chainOf(node.callee), (chain) => ({
      root: chain.root,
      steps: [...chain.steps, "call" as const],
    }));
  return Option.none();
};

/** A runner a callee chain starts at: the name it is (`it` for a group's parameter) and its module (none for the global). */
interface Runner {
  readonly name: string;
  readonly module: Option.Option<string>;
}

/**
 * What a runner's call is: a test, a suite (whose `{ timeout }` its tests
 * take), a layer group (whose options are its hooks'), or none of these.
 */
type Kind = "test" | "suite" | "layer" | "other";

/**
 * What a call whose callee is `chain`, on `runner`, is. A member the runner
 * builds no test with (a fixture, a hook) makes none; a suite's name, read
 * or called, makes a suite; `layer` makes @effect/vitest's group, but
 * effect-bun-test's and bun's `layer(L)` give back a test (a group's factory
 * takes the test API, a test's body takes nothing, which tells them apart
 * where the module does not).
 */
const kindOf = (runner: Runner, chain: Chain, body: ESTree.Node): Kind => {
  const members = chain.steps.flatMap((step) => {
    if (step === "call") return [];
    return [step.member];
  });
  if (members.some((member) => notTests.has(member))) return "other";
  if (suiteNames.has(runner.name) || members.some((member) => suiteNames.has(member)))
    return "suite";
  if (runner.name === "layer" || members.includes("layer")) {
    if (Option.contains(runner.module, "@effect/vitest")) return "layer";
    if (
      Option.exists(
        runner.module,
        (module) => module === "effect-bun-test" || module === "bun:test",
      )
    )
      return "test";
    if (isFunction(body) && body.params.length > 0) return "layer";
    return "test";
  }
  if (testNames.has(runner.name)) return "test";
  return "other";
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

/** Whether a call makes an effect `ChildProcess` command: `ChildProcess.make`, or `make` imported. */
const makesCommand = (bindings: NameBindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === "MemberExpression")
    return (
      Option.contains(memberName(callee), "make") && isChildProcessModule(bindings, callee.object)
    );
  return bindings.importsAs(callee, isChildProcess, "make");
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
 * A call the rule follows: where it is made (`host`), what it reaches
 * itself, and the function of the file it calls (`helper`, the name that
 * function is bound to) when it calls one.
 */
interface Call {
  readonly host: ESTree.Node;
  readonly reach: Option.Option<Reach>;
  readonly helper: Option.Option<ESTree.Node & { readonly name: string }>;
}

/** What a call reaches, given what each helper reaches: a helper's reach is seen through the helper. */
const reachOf = (call: Call, helpers: ReadonlyMap<ESTree.Node, Reach>): Option.Option<Reach> =>
  stronger(
    call.reach,
    Option.flatMap(call.helper, (helper) =>
      Option.map(Option.fromUndefinedOr(helpers.get(helper)), (reach) => ({
        ...reach,
        via: Option.some(helper.name),
      })),
    ),
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
      const reach = stronger(
        known,
        Option.map(reachOf(call, helpers), (found) => ({ ...found, via: Option.none() })),
      );
      if (Option.isNone(reach) || Option.exists(known, (k) => k.kind === reach.value.kind))
        continue;
      helpers.set(call.host, reach.value);
      grew = true;
    }
  }
  return helpers;
};

/** What a test or a suite names as its timeout: none, a number the rule reads, or a value it cannot read. */
const Timeout = Schema.TaggedUnion({
  None: {},
  Read: { ms: Schema.Number },
  Unread: {},
});
type Timeout = typeof Timeout.Type;

const none: Timeout = Timeout.cases.None.make({});
const unread: Timeout = Timeout.cases.Unread.make({});
const read = (ms: number): Timeout => Timeout.cases.Read.make({ ms });

/** Who names a test's timeout: the test, or a suite around it. */
type Giver = "own" | "suite";

/** A budget the rule reads: its milliseconds, and who named it. */
interface Budget {
  readonly ms: number;
  readonly from: Giver;
}

/** The timeout a test has, and who named it. */
interface Named {
  readonly timeout: Timeout;
  readonly from: Giver;
}

export const requireSpawnBudget = Rule.define({
  name: "require-spawn-budget",
  meta: Rule.meta({
    type: "problem",
    description:
      "Give a test that calls a process starter, or effect's ChildProcess.make, its timeout: starting a process takes the machine's time, and a runner's default fails a loaded one.",
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
    const kinds = new Map<ESTree.Node, Kind>();

    /** The runner a name is: imported from a runner module, the global, or a group factory's first parameter. */
    const runnerOf = (root: ESTree.IdentifierReference): Option.Option<Runner> => {
      for (const name of runnerNames) {
        for (const module of runnerModules)
          if (bindings.importsAs(root, (from) => from === module, name))
            return Option.some({ name, module: Option.some(module) });
        if (bindings.isGlobal(root, name)) return Option.some({ name, module: Option.none() });
      }
      return Option.flatMap(bindings.definitionOf(root), (definition) => {
        const factory = definition.node;
        if (definition.type !== "Parameter" || !isFunction(factory)) return Option.none();
        const first = factory.params[0];
        if (first?.type !== "Identifier" || first.name !== root.name) return Option.none();
        return Option.flatMap(parentOf(factory), (group) => {
          if (group.type !== "CallExpression") return Option.none();
          if (!group.arguments.some((argument) => argument === factory)) return Option.none();
          const kind = kindOfCall(group);
          if (kind !== "suite" && kind !== "layer") return Option.none();
          return Option.map(runnerOfCall(group), (runner) => ({
            name: "it",
            module: runner.module,
          }));
        });
      });
    };

    const runnerOfCall = (call: ESTree.CallExpression): Option.Option<Runner> =>
      Option.flatMap(chainOf(call.callee), (chain) => runnerOf(chain.root));

    /** What a call is: a test, a suite, a layer group, or none, for a call with a function among its arguments. */
    const kindOfCall = (call: ESTree.CallExpression): Kind => {
      const known = Option.fromUndefinedOr(kinds.get(call));
      if (Option.isSome(known)) return known.value;
      const kind = Option.getOrElse(
        Option.flatMap(Arr.findFirst(call.arguments, isFunction), (body) =>
          Option.flatMap(chainOf(call.callee), (chain) =>
            Option.map(runnerOf(chain.root), (runner) => kindOf(runner, chain, body)),
          ),
        ),
        (): Kind => "other",
      );
      kinds.set(call, kind);
      return kind;
    };

    const isTest = (node: ESTree.Node): node is ESTree.CallExpression =>
      node.type === "CallExpression" && kindOfCall(node) === "test";

    /**
     * Where a call is made: the test whose body makes it (its call), or the
     * function of the file it is made in (the name that function is bound to).
     */
    const hostOf = (node: ESTree.Node): Option.Option<ESTree.Node> => {
      for (const ancestor of ancestors(node)) {
        if (isTest(ancestor)) return Option.some(ancestor);
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

    /** What a call reaches itself: a process it starts, a command it makes, or neither. */
    const reachOfCall = (call: ESTree.CallExpression): Option.Option<Reach> => {
      const callee = ctx.sourceCode.getText(call.callee);
      if (starts(bindings, call)) return Option.some({ kind: "start", callee, via: Option.none() });
      if (makesCommand(bindings, call))
        return Option.some({ kind: "command", callee, via: Option.none() });
      return Option.none();
    };

    /** A timeout as a number the rule reads (a literal, or a `const` holding one), or one it cannot. */
    const timeoutValue = (expression: ESTree.Expression): Timeout => {
      const value = resolve(expression);
      if (value.type === "Literal" && Predicate.isNumber(value.value)) return read(value.value);
      return unread;
    };

    /** What one argument of a test or a suite, past its name and body, says of its timeout. */
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
     * The timeout a call names: a number after its body, or `{ timeout }` in
     * its options, before the body (Vitest's `it(name, options, body)`) or
     * after it.
     */
    const timeoutOf = (call: ESTree.CallExpression): Timeout => {
      const body = call.arguments.findIndex(isFunction);
      const named = call.arguments
        .filter((_, at) => at !== body && (at !== 0 || body === 0))
        .map(timeoutIn);
      return Option.getOrElse(
        Arr.findFirst(named, (timeout) => timeout._tag !== "None"),
        () => none,
      );
    };

    /** The timeout a test has: its own, else the nearest suite's around it that names one. */
    const budgetOf = (test: ESTree.CallExpression): Named => {
      const own = timeoutOf(test);
      if (own._tag !== "None") return { timeout: own, from: "own" };
      for (const ancestor of ancestors(test)) {
        if (ancestor.type !== "CallExpression" || kindOfCall(ancestor) !== "suite") continue;
        const timeout = timeoutOf(ancestor);
        if (timeout._tag !== "None") return { timeout, from: "suite" };
      }
      return { timeout: none, from: "own" };
    };

    /** The report a test that reaches `reach` earns, if any. */
    const findingOf = (
      test: ESTree.CallExpression,
      reach: Reach,
    ): ReadonlyArray<Diagnostic.Diagnostic> => {
      const { timeout, from } = budgetOf(test);
      return Timeout.match(timeout, {
        None: () => [Diagnostic.make({ node: test, message: message(reach) })],
        Read: ({ ms }) => {
          if (ms >= minimum) return [];
          return [
            Diagnostic.make({ node: test, message: shortMessage(reach, minimum, { ms, from }) }),
          ];
        },
        Unread: () => [],
      });
    };

    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (isTest(node)) tests.push(node);
        const helper = Option.flatMap(Option.liftPredicate(node.callee, isIdentifier), (callee) =>
          Option.map(bindings.definitionOf(callee), (definition) => definition.name),
        );
        const reach = reachOfCall(node);
        const host = hostOf(node);
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
