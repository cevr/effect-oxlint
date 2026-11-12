/**
 * Every way a test file binds a lifecycle hook, from every kind of module: the
 * case matrix of noTestLifecycleHooks. Each case is one test file that calls a
 * hook once, named `<form>/<module>/<hook>` so a report maps back to its case.
 */
import { lintFixtures, reportedLines } from "./lint-fixtures.js";

export const hooks = ["afterAll", "afterEach", "beforeAll", "beforeEach"] as const;

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

/** A binding form: the file that binds `hook` from `from` and calls it. */
export const forms = {
  namedImport: (from, hook) => `import { ${hook} } from "${from}";\n${hook}(() => {});\n`,
  aliasedImport: (from, hook) => `import { ${hook} as run } from "${from}";\nrun(() => {});\n`,
  namespaceImport: (from, hook) => `import * as ns from "${from}";\nns.${hook}(() => {});\n`,
  defaultImportCalled: (from, hook) => `import ${hook} from "${from}";\n${hook}(() => {});\n`,
  defaultImportMember: (from, hook) => `import ns from "${from}";\nns.${hook}(() => {});\n`,
  requireDestructure: (from, hook) =>
    `const { ${hook} } = require("${from}");\n${hook}(() => {});\n`,
  aliasedRequireDestructure: (from, hook) =>
    `const { ${hook}: run } = require("${from}");\nrun(() => {});\n`,
  requireNamespace: (from, hook) => `const ns = require("${from}");\nns.${hook}(() => {});\n`,
  requireMember: (from, hook) =>
    `const ${hook} = require("${from}").${hook};\n${hook}(() => {});\n`,
  aliasedRequireMember: (from, hook) => `const run = require("${from}").${hook};\nrun(() => {});\n`,
  requireCalled: (from, hook) => `\nrequire("${from}").${hook}(() => {});\n`,
} satisfies Record<string, (from: string, hook: string) => string>;

export interface HookCase {
  readonly id: string;
  readonly runner: boolean;
}

const caseFile = (id: string): string => `${id.replaceAll(/[^\w-]/gu, "_")}.test.ts`;

export const hookCases = (): ReadonlyArray<HookCase & { readonly source: string }> =>
  Object.entries(forms).flatMap(([form, write]) =>
    [
      ...runnerModules.map((from) => ({ from, runner: true })),
      ...projectModules.map((from) => ({ from, runner: false })),
    ].flatMap(({ from, runner }) =>
      hooks.map((hook) => ({ id: `${form}/${from}/${hook}`, runner, source: write(from, hook) })),
    ),
  );

/** Lint every case in one oxlint run: the ids of the cases the rule reported (on the call, line 2). */
export const reportedHookCases = (): ReadonlySet<string> => {
  const cases = hookCases();
  const findings = lintFixtures(
    "noTestLifecycleHooks",
    Object.fromEntries(cases.map((hookCase) => [caseFile(hookCase.id), hookCase.source])),
  );
  return new Set(
    cases
      .filter((hookCase) => reportedLines(findings, caseFile(hookCase.id)).includes(2))
      .map((hookCase) => hookCase.id),
  );
};
