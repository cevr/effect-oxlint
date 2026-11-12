/**
 * Every way a test file binds a lifecycle hook, from every kind of module: the
 * case matrix of noTestLifecycleHooks. A binding form is composed, not listed:
 * a source of the module (an import, `require`, `import()`, `import =`, ...),
 * a wrapper around it (`as`, `satisfies`, `!`, `<T>`, parentheses), and a way
 * to bind the hook from it (destructure, member, namespace, reassignment, ...).
 * Each case is one test file that calls a hook once, on its last line, named
 * `<form>/<module>/<hook>` so a report maps back to its case.
 *
 * The rule's contract over the matrix: a call of a name spelled like a hook
 * (`named`) is reported unless the name's one binding is one of the three local
 * shapes (`quiet`): a function declaration, `const x = <arrow or function>`, or
 * a value import from a project path. No other form is quiet, however local.
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
  // The module's value in a destructuring default (batch bc): the name holds it when the key is missing.
  valueDefault: (value, hook) =>
    `const { ${hook} = (${value}).${hook} } = {} as any;\n${hook}(() => {});`,
  arrayDefault: (value, hook) =>
    `const [${hook} = (${value}).${hook}] = [] as any[];\n${hook}(() => {});`,
  nestedDefault: (value, hook) =>
    `const { a: { ${hook} = (${value}).${hook} } = {} } = {} as any;\n${hook}(() => {});`,
  forOfDefault: (value, hook) =>
    `for (const { ${hook} = (${value}).${hook} } of [{}] as any[]) ${hook}(() => {});`,
  assignDefault: (value, hook) =>
    `let ${hook};\n({ ${hook} = (${value}).${hook} } = {} as any);\n${hook}(() => {});`,
} satisfies Record<string, (value: string, hook: string) => string>;

/** Forms an import statement alone makes: the hook named in the import itself. */
export const importForms = {
  namedImport: (from, hook) => `import { ${hook} } from "${from}";\n${hook}(() => {});`,
  aliasedImport: (from, hook) => `import { ${hook} as run } from "${from}";\nrun(() => {});`,
  stringNamedImport: (from, hook) => `import { "${hook}" as run } from "${from}";\nrun(() => {});`,
  defaultImportCalled: (from, hook) => `import ${hook} from "${from}";\n${hook}(() => {});`,
} satisfies Record<string, (from: string, hook: string) => string>;

/** The import forms that bind the hook's own name by a value import: quiet from a project path. */
const projectImportForms: ReadonlySet<string> = new Set(["namedImport", "defaultImportCalled"]);

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
 * calls, a class, an object, a getter, a protocol the language calls. The rule follows
 * none of them: a name spelled like a hook bound from any of them is reported.
 */
export const producers = {
  none: (e, awaited) => ({ prelude: "", value: awaitIf(awaited, e) }),
  arrowThunk: (e, awaited) => ({
    prelude: `const make = () => ${e};\n`,
    value: awaitIf(awaited, "make()"),
  }),
  functionDeclaration: (e, awaited) => ({
    prelude: `function make() {\n  return ${e};\n}\n`,
    value: awaitIf(awaited, "make()"),
  }),
  asyncThunk: (e, awaited) => ({
    prelude: `const make = async () => ${awaitIf(awaited, e)};\n`,
    value: "await make()",
  }),
  iife: (e, awaited) => ({ prelude: "", value: awaitIf(awaited, `(() => ${e})()`) }),
  optionalCall: (e, awaited) => ({
    prelude: `const make = () => ${e};\n`,
    value: awaitIf(awaited, "make?.()"),
  }),
  identity: (e, awaited) => ({
    prelude: "const pass = (m: any) => m;\n",
    value: awaitIf(awaited, `pass(${e})`),
  }),
  defaultParameter: (e, awaited) => ({
    prelude: `const make = (m = ${e}) => m;\n`,
    value: awaitIf(awaited, "make()"),
  }),
  staticField: (e, awaited) => ({
    prelude: `class Holder {\n  static mod = ${e};\n}\n`,
    value: awaitIf(awaited, "Holder.mod"),
  }),
  taggedArrow: (e, awaited) => ({
    prelude: `const tag = (..._: any[]) => ${e};\n`,
    value: awaitIf(awaited, "tag``"),
  }),
  taggedFunction: (e, awaited) => ({
    prelude: `function tag(..._: any[]) {\n  return ${e};\n}\n`,
    value: awaitIf(awaited, "tag`x${1}`"),
  }),
  taggedIife: (e, awaited) => ({
    prelude: "",
    value: awaitIf(awaited, `((..._: any[]) => ${e})\`\``),
  }),
  iifeParameter: (e, awaited) => ({
    prelude: `let held: any;\n((m: any) => {\n  held = m;\n})(${e});\n`,
    value: awaitIf(awaited, "held"),
  }),
  callerParameter: (e, awaited) => ({
    prelude: "function take(m: any) {\n  return m;\n}\n",
    value: awaitIf(awaited, `take(${e})`),
  }),
  thenable: (e, awaited) => ({
    prelude: `const thenable = { then(resolve: any) { resolve(${e}); } };\n`,
    value: awaitIf(awaited, "await thenable"),
  }),
  staticThen: (e, awaited) => ({
    prelude: `class Thenable {\n  static then(resolve: any) {\n    resolve(${e});\n  }\n}\n`,
    value: awaitIf(awaited, "await Thenable"),
  }),
  iterable: (e, awaited) => ({
    prelude: `const [held] = { *[Symbol.iterator]() { yield ${e}; } } as any;\n`,
    value: awaitIf(awaited, "held"),
  }),
  forOf: (e, awaited) => ({
    prelude: `let held: any;\nfor (const item of { *[Symbol.iterator]() { yield ${e}; } } as any) held = item;\n`,
    value: awaitIf(awaited, "held"),
  }),
  spreadIterable: (e, awaited) => ({
    prelude: `const [held] = [...({ *[Symbol.iterator]() { yield ${e}; } } as any)];\n`,
    value: awaitIf(awaited, "held"),
  }),
  callbackParameter: (e, awaited) => ({
    prelude: `let held: any;\n[${e}].forEach((m: any) => {\n  held = m;\n});\n`,
    value: awaitIf(awaited, "held"),
  }),
  catchBinding: (e, awaited) => ({
    prelude: `let held: any;\ntry {\n  throw ${e};\n} catch (m) {\n  held = m;\n}\n`,
    value: awaitIf(awaited, "held"),
  }),
  escapedFunction: (e, awaited) => ({
    prelude: "const take = (m: any) => m;\nconst kept = [take];\n",
    value: awaitIf(awaited, `take(${e})`),
  }),
  rebound: (e, awaited) => ({
    prelude: `let make = (): any => ({});\nmake = () => ${e};\n`,
    value: awaitIf(awaited, "make()"),
  }),
  decoratedStatic: (e, awaited) => ({
    prelude: `const dec = (..._: any[]): any => undefined;\nclass Holder {\n  @dec static mod = ${e};\n}\n`,
    value: awaitIf(awaited, "Holder.mod"),
  }),
  decoratedClass: (e, awaited) => ({
    prelude: `const dec = (..._: any[]): any => undefined;\n@dec\nclass Holder {\n  static mod = ${e};\n}\n`,
    value: awaitIf(awaited, "Holder.mod"),
  }),
  coercion: (e, awaited) => ({
    prelude: `const target: any = {};\nconst coerced = { toString() { target.mod = ${e}; return ""; } };\nString(\`\${coerced}\`);\n`,
    value: awaitIf(awaited, "target.mod"),
  }),
  proxy: (e, awaited) => ({
    prelude: `const held: any = new Proxy({}, { get: () => ${e} });\n`,
    value: awaitIf(awaited, "held.mod"),
  }),
  objectMethod: (e, awaited) => ({
    prelude: `const factory = { make() { return ${e}; } };\n`,
    value: awaitIf(awaited, "factory.make()"),
  }),
  getter: (e, awaited) => ({
    prelude: `const holder = { get mod() { return ${e}; } };\n`,
    value: awaitIf(awaited, "holder.mod"),
  }),
  newClass: (e, awaited) => ({
    prelude: `class Holder {\n  mod = ${e};\n}\n`,
    value: awaitIf(awaited, "new Holder().mod"),
  }),
  classMethod: (e, awaited) => ({
    prelude: `class Factory {\n  make() {\n    return ${e};\n  }\n}\n`,
    value: awaitIf(awaited, "new Factory().make()"),
  }),
  objectAssign: (e, awaited) => ({
    prelude: `const target = {};\nObject.assign(target, ${awaitIf(awaited, e)});\n`,
    value: "target",
  }),
  memberAssign: (e, awaited) => ({
    prelude: `const target: any = {};\ntarget.mod = ${awaitIf(awaited, e)};\n`,
    value: "target.mod",
  }),
} satisfies Record<string, (e: string, awaited: boolean) => Produced>;

export interface HookCase {
  readonly id: string;
  /** Whether the call on the last line calls a name spelled like the hook: what 0.32.1 matched. */
  readonly named: boolean;
  /** Whether that name's one binding is a whitelisted local shape: the rule must leave it. */
  readonly quiet: boolean;
  readonly source: string;
}

/** The line a case calls its hook on: its last. */
export const callLine = (source: string): number => source.split("\n").length;

/** Whether a source's last line calls `hook` by its bare name (not `x.hook(`, not `run(`). */
const callsByName = (source: string, hook: string): boolean =>
  new RegExp(`(^|[^.\\w$])${hook}\\(\\(\\) => \\{\\}\\)`, "u").test(
    source.trimEnd().split("\n").at(-1) ?? "",
  );

const makeCase = (id: string, hook: string, source: string, quiet: boolean): HookCase => ({
  id,
  named: callsByName(source, hook),
  quiet,
  source,
});

/**
 * Each module source × producer × binding, from one runner and one project module and
 * through one wrapper, each turning with the case.
 */
export const producerCases = (): ReadonlyArray<HookCase> =>
  Object.entries(moduleSources).flatMap(([source, bind], sourceIndex) =>
    Object.entries(producers).flatMap(([producer, make], producerIndex) =>
      Object.entries(bindings).flatMap(([binding, write], bindingIndex) => {
        const turn = sourceIndex + producerIndex + bindingIndex;
        const wrapperEntries = Object.entries(wrappers);
        const [wrapper, wrap] = wrapperEntries[turn % wrapperEntries.length] ?? [
          "none",
          wrappers.none,
        ];
        const modules = [
          runnerModules[turn % runnerModules.length] ?? "vitest",
          projectModules[turn % projectModules.length] ?? "./setup.js",
        ];
        return modules.map((from, moduleIndex) => {
          const hook = hooks[(turn + moduleIndex) % hooks.length] ?? "afterAll";
          const module: Source = bind(from);
          const produced = make(module.expression, module.awaited === true);
          // `export {}` makes the file a module, so `await (...)` parses as an await, not a call of `await`.
          return makeCase(
            `${source}.${producer}.${wrapper}.${binding}/${from}/${hook}`,
            hook,
            `export {};\n${module.prelude}${produced.prelude}${write(wrap(produced.value), hook)}\n`,
            false,
          );
        });
      }),
    ),
  );

/** Values that are no module's: one made in the file, a global, a global's result. None is quiet. */
export const valueSources = {
  local: {
    prelude: `const mod = { ${hooks.map((hook) => `${hook}: (f: () => void) => f()`).join(", ")} };\n`,
    expression: "mod",
  },
  globalThis: { prelude: "", expression: "globalThis" },
  globalCall: { prelude: "", expression: 'loadHooks("vitest")' },
} as const;

/** Each value source × wrapper × binding, the hook turning with the case. */
const valueCases = (): ReadonlyArray<HookCase> =>
  Object.entries(valueSources).flatMap(([kind, value]) =>
    Object.entries(wrappers).flatMap(([wrapper, wrap], wrapperIndex) =>
      Object.entries(bindings).map(([binding, write], bindingIndex) => {
        const hook = hooks[(wrapperIndex + bindingIndex) % hooks.length] ?? "afterAll";
        return makeCase(
          `${kind}.${wrapper}.${binding}/${kind}/${hook}`,
          hook,
          `${value.prelude}${write(wrap(value.expression), hook)}\n`,
          false,
        );
      }),
    ),
  );

/**
 * A hook-named binding made in the file: the three quiet shapes, and the shapes next
 * to them the rule must still report. Each gives the lines before the call, and the call.
 * Each condition of the rule's whitelist has a near miss that breaks it alone:
 * - one binding: `redeclaredFunction`; never written: `reassignedFunction`;
 * - a function declaration's own name: `functionParameter`;
 * - a plain const name: `functionLiteralDestructure`, `functionLiteralArrayDestructure`;
 * - `const`: `letArrow`, `varFunction`; not `declare`: `declaredConstArrow`;
 * - the literal init: `wrappedArrow`, `localCallResult`;
 * - a value import: `typeImport`, `typeOnlyImport`, `typeOnlyDefaultImport`;
 * - a project path: the package modules of `importForms`.
 */
export const localBindings = {
  functionDeclaration: {
    quiet: true,
    write: (hook) => `function ${hook}(f: () => void) {\n  f();\n}\n${hook}(() => {});`,
  },
  exportedFunction: {
    quiet: true,
    write: (hook) => `export function ${hook}(f: () => void) {\n  f();\n}\n${hook}(() => {});`,
  },
  constArrow: {
    quiet: true,
    write: (hook) => `const ${hook} = (f: () => void) => f();\n${hook}(() => {});`,
  },
  constFunction: {
    quiet: true,
    write: (hook) => `const ${hook} = function (f: () => void) {\n  f();\n};\n${hook}(() => {});`,
  },
  calledThroughWrapper: {
    quiet: true,
    write: (hook) => `const ${hook} = (f: () => void) => f();\n(${hook} as any)(() => {});`,
  },
  letArrow: {
    quiet: false,
    write: (hook) => `let ${hook} = (f: () => void) => f();\n${hook}(() => {});`,
  },
  varFunction: {
    quiet: false,
    write: (hook) => `var ${hook} = function (f: () => void) {\n  f();\n};\n${hook}(() => {});`,
  },
  wrappedArrow: {
    quiet: false,
    write: (hook) => `const ${hook} = ((f: () => void) => f()) as any;\n${hook}(() => {});`,
  },
  localCallResult: {
    quiet: false,
    write: (hook) =>
      `const make = () => (f: () => void) => f();\nconst ${hook} = make();\n${hook}(() => {});`,
  },
  localDestructure: {
    quiet: false,
    write: (hook) => `const { ${hook} } = { ${hook}: (f: () => void) => f() };\n${hook}(() => {});`,
  },
  localDefault: {
    quiet: false,
    write: (hook) => `const { ${hook} = (f: () => void) => f() } = {} as any;\n${hook}(() => {});`,
  },
  reassignedFunction: {
    quiet: false,
    write: (hook) =>
      `function ${hook}(f: () => void) {\n  f();\n}\n${hook} = (globalThis as any).${hook};\n${hook}(() => {});`,
  },
  redeclaredFunction: {
    quiet: false,
    write: (hook) =>
      `function ${hook}(f: () => void) {\n  f();\n}\nvar ${hook} = (globalThis as any).${hook};\n${hook}(() => {});`,
  },
  declaredFunction: {
    quiet: false,
    write: (hook) => `declare function ${hook}(f: () => void): void;\n${hook}(() => {});`,
  },
  declaredConst: {
    quiet: false,
    write: (hook) => `declare const ${hook}: (f: () => void) => void;\n${hook}(() => {});`,
  },
  parameter: {
    quiet: false,
    write: (hook) => `const run = (${hook}: any) =>\n  ${hook}(() => {});`,
  },
  catchBinding: {
    quiet: false,
    write: (hook) => `try {\n  run();\n} catch (${hook}: any) { ${hook}(() => {}); }`,
  },
  typeImport: {
    quiet: false,
    write: (hook) => `import { type ${hook} } from "./setup.js";\n${hook}(() => {});`,
  },
  projectNamespaceMember: {
    quiet: false,
    write: (hook) =>
      `import * as ns from "./setup.js";\nconst ${hook} = ns.${hook};\n${hook}(() => {});`,
  },
  projectRequire: {
    quiet: false,
    write: (hook) => `const ${hook} = require("./setup.js").${hook};\n${hook}(() => {});`,
  },
  shadowedByParameter: {
    quiet: false,
    write: (hook) =>
      `function ${hook}(f: () => void) {\n  f();\n}\nconst run = (${hook}: any) =>\n  ${hook}(() => {});`,
  },
  global: { quiet: false, write: (hook) => `${hook}(() => {});` },
  // A destructuring whose init is a function literal: only `node.id === name` tells it from a const arrow.
  functionLiteralDestructure: {
    quiet: false,
    write: (hook) =>
      `const { ${hook} = (globalThis as any).${hook} } = () => {};\n${hook}(() => {});`,
  },
  functionLiteralArrayDestructure: {
    quiet: false,
    write: (hook) =>
      `const [${hook} = (globalThis as any).${hook}] = function () {};\n${hook}(() => {});`,
  },
  // An ambient const with a function literal: it emits nothing, so the global hook runs.
  declaredConstArrow: {
    quiet: false,
    write: (hook) => `declare const ${hook} = (f: () => void) => f();\n${hook}(() => {});`,
  },
  // A function declaration's parameter: its definition's node is the FunctionDeclaration.
  functionParameter: {
    quiet: false,
    write: (hook) => `function run(${hook}: any) { ${hook}(() => {}); }`,
  },
  typeOnlyImport: {
    quiet: false,
    write: (hook) => `import type { ${hook} } from "./setup.js";\n${hook}(() => {});`,
  },
  typeOnlyDefaultImport: {
    quiet: false,
    write: (hook) => `import type ${hook} from "./setup.js";\n${hook}(() => {});`,
  },
} satisfies Record<string, { readonly quiet: boolean; readonly write: (hook: string) => string }>;

/** Where a shape sits: the module's top level, or inside a test's callback. */
const scopes = {
  module: (lines: string) => lines,
  callback: (lines: string) => {
    const all = lines.split("\n");
    const call = all.pop() ?? "";
    return ['describe("x", () => {', ...all.map((line) => `  ${line}`), `  ${call} });`].join("\n");
  },
} satisfies Record<string, (lines: string) => string>;

/** Shapes that parse only at a module's top level: an export, an import, a `declare`. */
const moduleOnlyBindings: ReadonlySet<string> = new Set([
  "exportedFunction",
  "declaredFunction",
  "declaredConst",
  "declaredConstArrow",
  "typeImport",
  "typeOnlyImport",
  "typeOnlyDefaultImport",
  "projectNamespaceMember",
]);

/** Each local shape × scope × hook. */
export const localCases = (): ReadonlyArray<HookCase> =>
  Object.entries(localBindings).flatMap(([kind, { quiet, write }]) =>
    Object.entries(scopes)
      .filter(([scope]) => scope === "module" || !moduleOnlyBindings.has(kind))
      .flatMap(([scope, place]) =>
        hooks.map((hook) =>
          makeCase(`local.${kind}.${scope}/local/${hook}`, hook, `${place(write(hook))}\n`, quiet),
        ),
      ),
  );

/**
 * Each form from each module, then the value and shape cases; the hook turns with the
 * case, so every hook meets every form and every module without the full product.
 */
export const hookCases = (): ReadonlyArray<HookCase> => [
  ...Object.entries(forms).flatMap(([form, write], formIndex) =>
    [
      ...runnerModules.map((from) => ({ from, project: false })),
      ...projectModules.map((from) => ({ from, project: true })),
    ].map(({ from, project }, moduleIndex) => {
      const hook = hooks[(formIndex + moduleIndex) % hooks.length] ?? "afterAll";
      return makeCase(
        `${form}/${from}/${hook}`,
        hook,
        `${write(from, hook)}\n`,
        project && projectImportForms.has(form),
      );
    }),
  ),
  ...valueCases(),
  ...localCases(),
];

/** One file per case, by its place in the matrix: ids differ where a file name would not (`@/x`, `~/x`). */
const caseFile = (index: number): string => `case-${index}.test.ts`;

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
