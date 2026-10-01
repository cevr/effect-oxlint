/**
 * What a test is, for every rule that treats test code differently.
 *
 * A test or spec module (`*.test.*`, `*.spec.*`) is always test code. A
 * project adds its own test code, such as helpers in a `tests/` tree or a
 * harness package, through the shared oxlint setting `effect.testFiles`: a
 * list of globs matched against the file's path relative to the lint root.
 *
 * ```json
 * { "settings": { "effect": { "testFiles": ["**\/tests/**", "packages/e2e/**"] } } }
 * ```
 */
import * as Schema from "effect/Schema";

import type { RuleContext, Visitor } from "../vendor/effect-oxlint/index.js";

/** Test and spec modules: `*.test.*` and `*.spec.*` with a JS or TS extension. */
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

export const isTestFile = (filename: string): boolean => testFilePattern.test(filename);

const EffectSettings = Schema.Struct({
  effect: Schema.optionalKey(
    Schema.Struct({ testFiles: Schema.optionalKey(Schema.Array(Schema.String)) }),
  ),
});

const decodeEffectSettings = Schema.decodeUnknownSync(EffectSettings);

/** Regex source for each glob wildcard; every other character matches itself. */
const globTokens = new Map([
  ["**/", "(?:[^/]*/)*"],
  ["**", ".*"],
  ["*", "[^/]*"],
  ["?", "[^/]"],
]);

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const globToRegex = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split(/(\*\*\/|\*\*|\*|\?)/u)
      .map((part) => globTokens.get(part) ?? escapeRegex(part))
      .join("")}$`,
    "u",
  );

/** Compiled globs, shared by every file and rule in one lint run. */
const compiledGlobs = new Map<string, RegExp>();

const compiledGlob = (glob: string): RegExp => {
  const cached = compiledGlobs.get(glob);
  if (cached) return cached;
  const compiled = globToRegex(glob);
  compiledGlobs.set(glob, compiled);
  return compiled;
};

/** The file's path relative to the lint root, with forward slashes. */
const lintRootPath = (context: RuleContext["Service"]): string => {
  const filename = context.filename.replaceAll("\\", "/");
  const root = `${context.cwd.replaceAll("\\", "/").replace(/\/$/u, "")}/`;
  if (filename.startsWith(root)) return filename.slice(root.length);
  return filename;
};

/** Whether the file a rule is linting matches one of `globs`, read like `effect.testFiles`. */
export const matchesFileGlobs = (
  context: RuleContext["Service"],
  globs: ReadonlyArray<string>,
): boolean => {
  if (globs.length === 0) return false;
  const path = lintRootPath(context);
  return globs.some((glob) => compiledGlob(glob).test(path));
};

/** Whether the file a rule is linting is test code: a test module or a configured test file. */
export const isTestModule = (context: RuleContext["Service"]): boolean =>
  isTestFile(context.filename) ||
  matchesFileGlobs(context, decodeEffectSettings(context.settings).effect?.testFiles ?? []);

/** Visitor for a file a rule does not apply to. */
export const skipFile: Visitor.EffectVisitor = {};
