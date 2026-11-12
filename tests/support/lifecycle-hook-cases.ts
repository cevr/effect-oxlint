/**
 * Every way a test file binds a lifecycle hook, from every kind of module: the
 * case matrix of noTestLifecycleHooks. A binding form is composed, not listed:
 * a source of the module (an import, `require`, `import()`, `import =`, ...),
 * a wrapper around it (`as`, `satisfies`, `!`, `<T>`, parentheses), and a way
 * to bind the hook from it (destructure, member, namespace, reassignment, ...).
 * Each case is one test file that calls a hook once, on its last line, named
 * `<form>/<module>/<hook>` so a report maps back to its case.
 */
import { lintFixtures, reportedLines } from "./lint-fixtures.js";

export const hooks = [
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
  "before",
  "after",
] as const;

/** Packages a test runner ships its hooks from. */
export const runnerModules = [
  "node:test",
  "mocha",
  "@playwright/test",
  "bun:test",
  "vitest",
  "@effect/vitest",
  "@jest/globals",
] as const;

/** The project's own modules: relative, absolute, and path aliases. */
export const projectModules = [
  "./setup.js",
  "../support/hooks.js",
  "/repo/test/hooks.js",
  "@/test/hooks",
  "~/test/hooks",
  "#test/hooks",
] as const;

/**
 * A source of the module whole: the lines that bind it, and the expression that reads
 * it; `awaited` when the expression is a promise of it (`import("x")`).
 */
interface Source {
  readonly prelude: string;
  readonly expression: string;
  readonly awaited?: boolean;
}

/** The expression a source's module reads as: awaited when it is a promise. */
const readModule = (source: Source): string => awaitIf(source.awaited === true, source.expression);

const awaitIf = (awaited: boolean, expression: string): string => {
  if (awaited) return `await ${expression}`;
  return expression;
};

export const moduleSources = {
  require: (from) => ({ prelude: "", expression: `require("${from}")` }),
  createRequire: (from) => ({
    prelude:
      'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\n',
    expression: `load("${from}")`,
  }),
  createRequireCalled: (from) => ({
    prelude: 'import { createRequire } from "node:module";\n',
    expression: `createRequire(import.meta.url)("${from}")`,
  }),
  dynamicImport: (from) => ({ prelude: "", expression: `import("${from}")`, awaited: true }),
  importEquals: (from) => ({ prelude: `import mod = require("${from}");\n`, expression: "mod" }),
  namespaceImport: (from) => ({ prelude: `import * as mod from "${from}";\n`, expression: "mod" }),
  defaultImport: (from) => ({ prelude: `import mod from "${from}";\n`, expression: "mod" }),
  defaultAsImport: (from) => ({
    prelude: `import { default as mod } from "${from}";\n`,
    expression: "mod",
  }),
} satisfies Record<string, (from: string) => Source>;

export const wrappers = {
  none: (expression) => expression,
  parens: (expression) => `(${expression})`,
  as: (expression) => `${expression} as any`,
  satisfies: (expression) => `${expression} satisfies object`,
  nonNull: (expression) => `${expression}!`,
  typeAssertion: (expression) => `<any>${expression}`,
} satisfies Record<string, (expression: string) => string>;

/** A way to bind `hook` from the module expression `value` and call it: the file's last lines. */
export const bindings = {
  destructure: (value, hook) => `const { ${hook} } = ${value};\n${hook}(() => {});`,
  aliasedDestructure: (value, hook) => `const { ${hook}: run } = ${value};\nrun(() => {});`,
  defaultedDestructure: (value, hook) =>
    `const { ${hook} = () => {} } = ${value};\n${hook}(() => {});`,
  namespace: (value, hook) => `const ns = ${value};\nns.${hook}(() => {});`,
  member: (value, hook) => `const ${hook} = (${value}).${hook};\n${hook}(() => {});`,
  aliasedMember: (value, hook) => `const run = (${value}).${hook};\nrun(() => {});`,
  stringKeyMember: (value, hook) => `const run = (${value})["${hook}"];\nrun(() => {});`,
  called: (value, hook) => `(${value}).${hook}(() => {});`,
  reassigned: (value, hook) => `let ${hook};\n${hook} = (${value}).${hook};\n${hook}(() => {});`,
  aliasedReassigned: (value, hook) => `let run;\nrun = (${value}).${hook};\nrun(() => {});`,
  reassignedDestructure: (value, hook) =>
    `let ${hook};\n({ ${hook} } = ${value});\n${hook}(() => {});`,
  rebound: (value, hook) =>
    `const inner = ${value};\nconst { ${hook} } = inner;\n${hook}(() => {});`,
  aliasedRebound: (value, hook) =>
    `const inner = ${value};\nconst { ${hook}: run } = inner;\nrun(() => {});`,
} satisfies Record<string, (value: string, hook: string) => string>;

/** The bindings that call the hook by its own name, where the rest call it as `run` or `ns.<hook>`. */
export const hookNamedBindings: ReadonlySet<string> = new Set([
  "destructure",
  "defaultedDestructure",
  "member",
  "reassigned",
  "reassignedDestructure",
  "rebound",
]);

/** Forms an import statement alone makes: the hook named in the import itself. */
export const importForms = {
  namedImport: (from, hook) => `import { ${hook} } from "${from}";\n${hook}(() => {});`,
  aliasedImport: (from, hook) => `import { ${hook} as run } from "${from}";\nrun(() => {});`,
  stringNamedImport: (from, hook) => `import { "${hook}" as run } from "${from}";\nrun(() => {});`,
  defaultImportCalled: (from, hook) => `import ${hook} from "${from}";\n${hook}(() => {});`,
} satisfies Record<string, (from: string, hook: string) => string>;

/** Every binding form: the import forms, then each source × wrapper × binding. */
export const forms = {
  ...importForms,
  ...Object.fromEntries(
    Object.entries(moduleSources).flatMap(([source, bind]) =>
      Object.entries(wrappers).flatMap(([wrapper, wrap]) =>
        Object.entries(bindings).map(([binding, write]) => [
          `${source}.${wrapper}.${binding}`,
          (from: string, hook: string) => {
            const module: Source = bind(from);
            return `${module.prelude}${write(wrap(readModule(module)), hook)}`;
          },
        ]),
      ),
    ),
  ),
};

/** What a value producer makes of a module expression: the lines it adds, and the expression of its result. */
interface Produced {
  readonly prelude: string;
  readonly value: string;
}

/**
 * Code a module passes through before it is bound: a function the file defines and
 * calls, a class, an object. `traceable` producers return or hold the module where the
 * rule can follow it; the rest hide it (a getter, a method, a mutation), so the rule
 * cannot prove their result the project's and reports a callee spelled like a hook.
 */
export const producers = {
  none: { traceable: true, make: (e, awaited) => ({ prelude: "", value: awaitIf(awaited, e) }) },
  arrowThunk: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `const make = () => ${e};\n`,
      value: awaitIf(awaited, "make()"),
    }),
  },
  functionDeclaration: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `function make() {\n  return ${e};\n}\n`,
      value: awaitIf(awaited, "make()"),
    }),
  },
  asyncThunk: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `const make = async () => ${awaitIf(awaited, e)};\n`,
      value: "await make()",
    }),
  },
  iife: {
    traceable: true,
    make: (e, awaited) => ({ prelude: "", value: awaitIf(awaited, `(() => ${e})()`) }),
  },
  optionalCall: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `const make = () => ${e};\n`,
      value: awaitIf(awaited, "make?.()"),
    }),
  },
  identity: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: "const pass = (m: any) => m;\n",
      value: awaitIf(awaited, `pass(${e})`),
    }),
  },
  defaultParameter: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `const make = (m = ${e}) => m;\n`,
      value: awaitIf(awaited, "make()"),
    }),
  },
  staticField: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `class Holder {\n  static mod = ${e};\n}\n`,
      value: awaitIf(awaited, "Holder.mod"),
    }),
  },
  taggedArrow: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `const tag = (..._: any[]) => ${e};\n`,
      value: awaitIf(awaited, "tag``"),
    }),
  },
  taggedFunction: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `function tag(..._: any[]) {\n  return ${e};\n}\n`,
      value: awaitIf(awaited, "tag`x${1}`"),
    }),
  },
  taggedIife: {
    traceable: true,
    make: (e, awaited) => ({ prelude: "", value: awaitIf(awaited, `((..._: any[]) => ${e})\`\``) }),
  },
  iifeParameter: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: `let held: any;\n((m: any) => {\n  held = m;\n})(${e});\n`,
      value: awaitIf(awaited, "held"),
    }),
  },
  callerParameter: {
    traceable: true,
    make: (e, awaited) => ({
      prelude: "function take(m: any) {\n  return m;\n}\n",
      value: awaitIf(awaited, `take(${e})`),
    }),
  },
  thenable: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const thenable = { then(resolve: any) { resolve(${e}); } };\n`,
      value: awaitIf(awaited, "await thenable"),
    }),
  },
  staticThen: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `class Thenable {\n  static then(resolve: any) {\n    resolve(${e});\n  }\n}\n`,
      value: awaitIf(awaited, "await Thenable"),
    }),
  },
  iterable: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const [held] = { *[Symbol.iterator]() { yield ${e}; } } as any;\n`,
      value: awaitIf(awaited, "held"),
    }),
  },
  forOf: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `let held: any;\nfor (const item of { *[Symbol.iterator]() { yield ${e}; } } as any) held = item;\n`,
      value: awaitIf(awaited, "held"),
    }),
  },
  spreadIterable: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const [held] = [...({ *[Symbol.iterator]() { yield ${e}; } } as any)];\n`,
      value: awaitIf(awaited, "held"),
    }),
  },
  callbackParameter: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `let held: any;\n[${e}].forEach((m: any) => {\n  held = m;\n});\n`,
      value: awaitIf(awaited, "held"),
    }),
  },
  catchBinding: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `let held: any;\ntry {\n  throw ${e};\n} catch (m) {\n  held = m;\n}\n`,
      value: awaitIf(awaited, "held"),
    }),
  },
  escapedFunction: {
    traceable: false,
    // The module is the call's argument, which a call's value includes: a runner's hook is traced through it.
    carries: true,
    make: (e, awaited) => ({
      prelude: "const take = (m: any) => m;\nconst kept = [take];\n",
      value: awaitIf(awaited, `take(${e})`),
    }),
  },
  rebound: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `let make = (): any => ({});\nmake = () => ${e};\n`,
      value: awaitIf(awaited, "make()"),
    }),
  },
  decoratedStatic: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const dec = (..._: any[]): any => undefined;\nclass Holder {\n  @dec static mod = ${e};\n}\n`,
      value: awaitIf(awaited, "Holder.mod"),
    }),
  },
  decoratedClass: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const dec = (..._: any[]): any => undefined;\n@dec\nclass Holder {\n  static mod = ${e};\n}\n`,
      value: awaitIf(awaited, "Holder.mod"),
    }),
  },
  coercion: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const target: any = {};\nconst coerced = { toString() { target.mod = ${e}; return ""; } };\nString(\`\${coerced}\`);\n`,
      value: awaitIf(awaited, "target.mod"),
    }),
  },
  proxy: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const held: any = new Proxy({}, { get: () => ${e} });\n`,
      value: awaitIf(awaited, "held.mod"),
    }),
  },
  objectMethod: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const factory = { make() { return ${e}; } };\n`,
      value: awaitIf(awaited, "factory.make()"),
    }),
  },
  getter: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const holder = { get mod() { return ${e}; } };\n`,
      value: awaitIf(awaited, "holder.mod"),
    }),
  },
  newClass: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `class Holder {\n  mod = ${e};\n}\n`,
      value: awaitIf(awaited, "new Holder().mod"),
    }),
  },
  classMethod: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `class Factory {\n  make() {\n    return ${e};\n  }\n}\n`,
      value: awaitIf(awaited, "new Factory().make()"),
    }),
  },
  objectAssign: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const target = {};\nObject.assign(target, ${awaitIf(awaited, e)});\n`,
      value: "target",
    }),
  },
  memberAssign: {
    traceable: false,
    make: (e, awaited) => ({
      prelude: `const target: any = {};\ntarget.mod = ${awaitIf(awaited, e)};\n`,
      value: "target.mod",
    }),
  },
} satisfies Record<
  string,
  {
    readonly traceable: boolean;
    readonly carries?: boolean;
    readonly make: (e: string, awaited: boolean) => Produced;
  }
>;

/**
 * Each module source × producer × binding, from one runner and one project module and
 * through one wrapper, each turning with the case.
 */
export const producerCases = (): ReadonlyArray<HookCase> =>
  Object.entries(moduleSources).flatMap(([source, bind], sourceIndex) =>
    Object.entries(producers).flatMap(([producer, producerSpec], producerIndex) =>
      Object.entries(bindings).flatMap(([binding, write], bindingIndex) => {
        const turn = sourceIndex + producerIndex + bindingIndex;
        const wrapperEntries = Object.entries(wrappers);
        const [wrapper, wrap] = wrapperEntries[turn % wrapperEntries.length] ?? [
          "none",
          wrappers.none,
        ];
        const modules = [
          { from: runnerModules[turn % runnerModules.length] ?? "vitest", runner: true },
          { from: projectModules[turn % projectModules.length] ?? "./setup.js", runner: false },
        ];
        return modules.map(({ from, runner }, moduleIndex) => {
          const hook = hooks[(turn + moduleIndex) % hooks.length] ?? "afterAll";
          const module: Source = bind(from);
          const { traceable, make } = producerSpec;
          const carries = "carries" in producerSpec && producerSpec.carries;
          const produced = make(module.expression, module.awaited === true);
          return {
            id: `${source}.${producer}.${wrapper}.${binding}/${from}/${hook}`,
            // A hidden value is reported where 0.32.1 matched it: a callee spelled like the hook.
            runner:
              ((traceable || carries) && runner) || (!traceable && hookNamedBindings.has(binding)),
            // `export {}` makes the file a module, so `await (...)` parses as an await, not a call of `await`.
            source: `export {};\n${module.prelude}${produced.prelude}${write(wrap(produced.value), hook)}\n`,
          };
        });
      }),
    ),
  );

/**
 * Values that are no module's: one made in the file, which the rule must leave, and
 * ones it cannot trace (a global, a global's result), which it must report as 0.32.1 did.
 */
export const valueSources = {
  local: {
    runner: false,
    prelude: `const mod = { ${hooks.map((hook) => `${hook}: (f: () => void) => f()`).join(", ")} };\n`,
    expression: "mod",
  },
  globalThis: { runner: true, prelude: "", expression: "globalThis" },
  globalCall: { runner: true, prelude: "", expression: 'loadHooks("vitest")' },
} as const;

export interface HookCase {
  readonly id: string;
  /** Whether the rule must report the call: a runner's hook, or a value it cannot trace. */
  readonly runner: boolean;
  readonly source: string;
}

/** Each value source × wrapper × binding, the hook turning with the case. */
const valueCases = (): ReadonlyArray<HookCase> =>
  Object.entries(valueSources).flatMap(([kind, value]) =>
    Object.entries(wrappers).flatMap(([wrapper, wrap], wrapperIndex) =>
      Object.entries(bindings).map(([binding, write], bindingIndex) => {
        const hook = hooks[(wrapperIndex + bindingIndex) % hooks.length] ?? "afterAll";
        return {
          id: `${kind}.${wrapper}.${binding}/${kind}/${hook}`,
          // An untraced value is reported where 0.32.1 matched it: a callee spelled like the hook.
          runner: value.runner && hookNamedBindings.has(binding),
          source: `${value.prelude}${write(wrap(value.expression), hook)}\n`,
        };
      }),
    ),
  );

/** One file per case, by its place in the matrix: ids differ where a file name would not (`@/x`, `~/x`). */
const caseFile = (index: number): string => `case-${index}.test.ts`;

/** The line a case calls its hook on: its last. */
export const callLine = (source: string): number => source.split("\n").length;

/**
 * Each form from each module; the hook turns with the case, so every hook meets
 * every form and every module without the full product.
 */
export const hookCases = (): ReadonlyArray<HookCase> => [
  ...Object.entries(forms).flatMap(([form, write], formIndex) =>
    [
      ...runnerModules.map((from) => ({ from, runner: true })),
      ...projectModules.map((from) => ({ from, runner: false })),
    ].map(({ from, runner }, moduleIndex) => {
      const hook = hooks[(formIndex + moduleIndex) % hooks.length] ?? "afterAll";
      return { id: `${form}/${from}/${hook}`, runner, source: `${write(from, hook)}\n` };
    }),
  ),
  ...valueCases(),
];

/** Lint every case in one oxlint run: the ids of the cases the rule reported on their call. */
export const reportedHookCases = (
  cases: ReadonlyArray<HookCase> = hookCases(),
): ReadonlySet<string> => {
  const findings = lintFixtures(
    "noTestLifecycleHooks",
    Object.fromEntries(cases.map((hookCase, index) => [caseFile(index), hookCase.source])),
  );
  return new Set(
    cases.flatMap((hookCase, index) => {
      if (!reportedLines(findings, caseFile(index)).includes(callLine(hookCase.source.trimEnd())))
        return [];
      return [hookCase.id];
    }),
  );
};
