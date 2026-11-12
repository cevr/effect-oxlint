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

/** A source of the module whole: the lines that bind it, and the expression that reads it. */
interface Source {
  readonly prelude: string;
  readonly expression: string;
}

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
  dynamicImport: (from) => ({ prelude: "", expression: `await import("${from}")` }),
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
            const { prelude, expression } = bind(from);
            return `${prelude}${write(wrap(expression), hook)}`;
          },
        ]),
      ),
    ),
  ),
};

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
export const reportedHookCases = (): ReadonlySet<string> => {
  const cases = hookCases();
  const findings = lintFixtures(
    "noTestLifecycleHooks",
    Object.fromEntries(cases.map((hookCase, index) => [caseFile(index), hookCase.source])),
  );
  return new Set(
    cases
      .filter((hookCase, index) =>
        reportedLines(findings, caseFile(index)).includes(callLine(hookCase.source.trimEnd())),
      )
      .map((hookCase) => hookCase.id),
  );
};
